// src/routes/Community.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';
import BeforeAfterUploader from './BeforeAfterUploader';

const COMMUNITY_BUCKET = 'community'; // for single-image shares
const MEDIA_BUCKET = 'media';         // for before/after pairs
const SIGNED_URL_TTL = 10 * 60;
const PAGE_SIZE = 24;
const PER_TABLE_LIMIT = 24;

const REACTION_OPTIONS = [
  { type: 'inspiring', label: 'Inspiring', emoji: '👏' },
  { type: 'progress', label: 'Great progress', emoji: '✨' },
  { type: 'love', label: 'Love this', emoji: '❤️' },
];

// ---------------- helpers ----------------
function isSafeUrl(u) {
  try {
    const url = new URL(u, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function publicUrl(bucket, path) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

function getPostKey(postType, postId) {
  return `${postType}:${String(postId)}`;
}

function emptyReactionCounts() {
  return {
    inspiring: 0,
    progress: 0,
    love: 0,
  };
}

// A tiny image component that tries public URL, then signed URL.
// It renders nothing unless an image successfully loads, so badges do not float.
function LabeledImage({
  bucket,
  path,
  alt,
  label,
  roundLeft = false,
  roundRight = false,
  height = 180,
}) {
  const [src, setSrc] = useState(null);
  const [triedSigned, setTriedSigned] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!path) return;

      // Try public first
      const pub = publicUrl(bucket, path);
      if (pub && !cancelled) {
        setSrc(pub);
        return;
      }

      // Short-lived fallback for public pairs stored in the private media bucket.
      try {
        const { data, error } = await supabase
          .storage
          .from(bucket)
          .createSignedUrl(path, SIGNED_URL_TTL);

        if (!cancelled && !error && data?.signedUrl) {
          setSrc(data.signedUrl);
        }
      } catch {
        // Ignore here; onError below handles failed loads.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  if (!src) return null;

  return (
    <div style={{ position: 'relative' }}>
      <img
        src={src}
        alt={alt}
        style={{
          width: '100%',
          height,
          objectFit: 'cover',
          borderTopLeftRadius: roundLeft ? 10 : 0,
          borderTopRightRadius: roundRight ? 10 : 0,
        }}
        loading="lazy"
        decoding="async"
        onError={async () => {
          // One more attempt: force a fresh signed URL if the public URL failed.
          if (triedSigned) {
            console.warn('[Community] image could not be loaded.');
            setSrc(null);
            return;
          }

          setTriedSigned(true);

          try {
            const { data, error } = await supabase
              .storage
              .from(bucket)
              .createSignedUrl(path, SIGNED_URL_TTL);

            if (!error && data?.signedUrl) {
              const bust = (data.signedUrl.includes('?') ? '&' : '?') + 'rb=' + Date.now();
              setSrc(data.signedUrl + bust);
            } else {
              console.warn('[Community] signed URL generation failed:', error?.message || 'Unknown error');
              setSrc(null);
            }
          } catch (e) {
            console.warn('[Community] signed URL error:', e?.message || 'Unknown error');
            setSrc(null);
          }
        }}
      />

      <span
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          background: 'rgba(0,0,0,.65)',
          color: '#fff',
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 12,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// Normalize single-image share rows
function mapShareRow(row) {
  return {
    key: `share:${row.id}`,
    type: 'single',
    id: row.id,
    caption: row.caption || 'Untitled',
    created_at: row.created_at,
    slug: row.slug,
    attribution_name: row.attribution_name,
    attribution_url: row.attribution_url,
    show_attribution: !!row.show_attribution,
    images: [
      {
        src: publicUrl(COMMUNITY_BUCKET, row.media_path),
        alt: row.caption || 'Community share',
      },
    ],
  };
}

// ---------------- page ----------------
export default function Community() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);       // unified list: singles + pairs
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [cursor, setCursor] = useState(null);   // ISO string of the smallest created_at in current list
  const [endReached, setEndReached] = useState(false);
  const [user, setUser] = useState(null);

  const [reactionCounts, setReactionCounts] = useState({});
  const [myReactions, setMyReactions] = useState({});
  const [reactingKey, setReactingKey] = useState(null);

  // Auth state for gating the uploader and reactions
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setAppliedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  function applyCommonFilters(qb, { search, pageCursor }) {
    if (search) qb = qb.ilike('caption', `%${search}%`);
    if (pageCursor) qb = qb.lt('created_at', pageCursor);
    return qb;
  }

  async function loadReactionsForItems(nextItems) {
    if (!nextItems.length) return;

    const postIds = [...new Set(nextItems.map((it) => String(it.id)))];
    const postTypes = [...new Set(nextItems.map((it) => it.type))];

    const { data: countRows, error } = await supabase
      .from('community_reactions')
      .select('post_type, post_id, reaction_type')
      .in('post_type', postTypes)
      .in('post_id', postIds);

    if (error) {
      console.error('[Community] reactions load error:', error);
      return;
    }

    const nextCounts = {};
    const nextMine = {};

    nextItems.forEach((it) => {
      const key = getPostKey(it.type, it.id);
      nextCounts[key] = emptyReactionCounts();
      nextMine[key] = {};
    });

    (countRows || []).forEach((row) => {
      const key = getPostKey(row.post_type, row.post_id);

      if (!nextCounts[key]) {
        nextCounts[key] = emptyReactionCounts();
      }

      if (row.reaction_type in nextCounts[key]) {
        nextCounts[key][row.reaction_type] += 1;
      }

    });

    if (user?.id) {
      const { data: mine, error: mineError } = await supabase
        .from('community_reactions')
        .select('post_type, post_id, reaction_type')
        .eq('user_id', user.id)
        .in('post_type', postTypes)
        .in('post_id', postIds);

      if (!mineError) {
        (mine || []).forEach((row) => {
          const key = getPostKey(row.post_type, row.post_id);
          if (!nextMine[key]) nextMine[key] = {};
          nextMine[key][row.reaction_type] = true;
        });
      }
    }

    setReactionCounts((prev) => ({
      ...prev,
      ...nextCounts,
    }));

    setMyReactions((prev) => ({
      ...prev,
      ...nextMine,
    }));
  }

  async function fetchBatch({ reset = false } = {}) {
    try {
      if (reset) {
        setLoading(true);
        setItems([]);
        setCursor(null);
        setEndReached(false);
        setReactionCounts({});
        setMyReactions({});
      } else {
        setLoadingMore(true);
      }

      const search = appliedQ;
      const pageCursor = reset ? null : cursor;

      // SHARES
      let sharesQ = supabase
        .from('shares')
        .select(
          'id, caption, media_path, slug, created_at, attribution_name, attribution_url, show_attribution'
        )
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(PER_TABLE_LIMIT);

      sharesQ = applyCommonFilters(sharesQ, { search, pageCursor });

      const { data: sharesData, error: sharesErr } = await sharesQ;
      if (sharesErr) throw sharesErr;

      const mappedShares = (sharesData || []).map(mapShareRow);

      // BEFORE/AFTER PAIRS
      let pairsQ = supabase
        .from('before_after_pairs')
        .select('id, caption, before_path, after_path, created_at, is_public')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(PER_TABLE_LIMIT);

      pairsQ = applyCommonFilters(pairsQ, { search, pageCursor });

      const { data: pairsData, error: pairsErr } = await pairsQ;
      if (pairsErr) throw pairsErr;

      const mappedPairs = (pairsData || []).map((row) => ({
        key: `pair:${row.id}`,
        type: 'pair',
        id: row.id,
        caption: row.caption || 'Untitled',
        created_at: row.created_at,
        before_path: row.before_path,
        after_path: row.after_path,
      }));

      // Merge + sort
      const merged = [...mappedShares, ...mappedPairs].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      const pageSlice = merged.slice(0, PAGE_SIZE);

      const nextCursor =
        pageSlice.length > 0
          ? pageSlice.reduce(
              (min, it) =>
                new Date(it.created_at) < new Date(min) ? it.created_at : min,
              pageSlice[0].created_at
            )
          : cursor;

      const exhausted =
        (mappedShares.length === 0 && mappedPairs.length === 0) ||
        pageSlice.length === 0;

      if (reset) {
        setItems(pageSlice);
      } else {
        setItems((prev) => [...prev, ...pageSlice]);
      }

      setCursor(nextCursor);

      if (exhausted) {
        setEndReached(true);
      }

      await loadReactionsForItems(pageSlice);
    } catch (err) {
      console.error('[Community] fetchBatch error:', err);

      if (reset) {
        setItems([]);
        setEndReached(true);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function toggleReaction(item, reactionType) {
    if (!user) {
      navigate('/login');
      return;
    }

    const postType = item.type;
    const postId = String(item.id);
    const postKey = getPostKey(postType, postId);
    const actionKey = `${postKey}:${reactionType}`;
    const alreadyReacted = !!myReactions[postKey]?.[reactionType];

    try {
      setReactingKey(actionKey);

      if (alreadyReacted) {
        const { error } = await supabase
          .from('community_reactions')
          .delete()
          .eq('user_id', user.id)
          .eq('post_type', postType)
          .eq('post_id', postId)
          .eq('reaction_type', reactionType);

        if (error) throw error;

        setMyReactions((prev) => ({
          ...prev,
          [postKey]: {
            ...(prev[postKey] || {}),
            [reactionType]: false,
          },
        }));

        setReactionCounts((prev) => ({
          ...prev,
          [postKey]: {
            ...(prev[postKey] || emptyReactionCounts()),
            [reactionType]: Math.max(
              ((prev[postKey] || emptyReactionCounts())[reactionType] || 0) - 1,
              0
            ),
          },
        }));
      } else {
        const { error } = await supabase
          .from('community_reactions')
          .insert({
            user_id: user.id,
            post_type: postType,
            post_id: postId,
            reaction_type: reactionType,
          });

        if (error) throw error;

        setMyReactions((prev) => ({
          ...prev,
          [postKey]: {
            ...(prev[postKey] || {}),
            [reactionType]: true,
          },
        }));

        setReactionCounts((prev) => ({
          ...prev,
          [postKey]: {
            ...(prev[postKey] || emptyReactionCounts()),
            [reactionType]:
              ((prev[postKey] || emptyReactionCounts())[reactionType] || 0) + 1,
          },
        }));
      }
    } catch (err) {
      console.error('[Community] reaction toggle error:', err);
    } finally {
      setReactingKey(null);
    }
  }

  useEffect(() => {
    fetchBatch({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedQ]);

  useEffect(() => {
    if (items.length > 0) {
      loadReactionsForItems(items);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const canLoadMore = !endReached;

  function ReactionBar({ item }) {
    const postKey = getPostKey(item.type, item.id);
    const counts = reactionCounts[postKey] || emptyReactionCounts();
    const mine = myReactions[postKey] || {};

    return (
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid rgba(0,0,0,.08)',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--muted)',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: '.04em',
          }}
        >
          React with encouragement
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {REACTION_OPTIONS.map((reaction) => {
            const isActive = !!mine[reaction.type];
            const actionKey = `${postKey}:${reaction.type}`;
            const isWorking = reactingKey === actionKey;

            return (
              <button
                key={reaction.type}
                type="button"
                className={isActive ? 'button primary' : 'button ghost'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleReaction(item, reaction.type);
                }}
                disabled={isWorking}
                title={user ? reaction.label : 'Sign in to react'}
                style={{
                  fontSize: 13,
                  padding: '6px 10px',
                  borderRadius: 999,
                }}
              >
                <span aria-hidden="true">{reaction.emoji}</span>{' '}
                <span>{counts[reaction.type] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <PageLayout
      title="Community Gallery"
      subtitle="Public before-and-after transformations, shared for inspiration."
    >
      {/* Intro */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Real progress, shared with care</h2>
        <p style={{ marginBottom: 0, color: 'var(--muted)' }}>
          Browse public transformations from the Before & After Vault community. These
          posts may include projects, makeovers, personal progress, home updates, beauty
          results, creative work, and other meaningful before-and-after moments.
        </p>
      </section>

      {/* Search */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input"
          placeholder="Search transformations, projects, makeovers…"
          aria-label="Search community transformations"
          style={{ flex: 1 }}
        />

        <button
          className="button ghost"
          onClick={() => {
            setQ('');
            setAppliedQ('');
          }}
          disabled={!q}
        >
          Clear
        </button>
      </div>

      {/* Uploader: only for signed-in users */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Share a Before & After</h2>
        <p style={{ color: 'var(--muted)', marginTop: -4 }}>
          Upload a transformation, progress photo, makeover, project, or result. You
          control what you choose to share publicly.
        </p>

        {user ? (
          <BeforeAfterUploader onCreated={() => fetchBatch({ reset: true })} />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 12,
            }}
          >
            <span>Please sign in to post a Before + After.</span>
            <Link to="/login" className="button">
              Sign in
            </Link>
          </div>
        )}
      </section>

      {/* Community note */}
      <section
        className="card"
        style={{
          padding: 14,
          marginBottom: 16,
          background: 'rgba(255,255,255,.7)',
        }}
      >
        <strong>Community note:</strong>{' '}
        <span style={{ color: 'var(--muted)' }}>
          This gallery is for encouragement, inspiration, and respectful sharing. Please
          only post images you have permission to share.
        </span>
      </section>

      {/* States */}
      {loading ? (
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            Loading community posts…
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>
            {appliedQ ? 'No matching posts yet' : 'No public transformations yet'}
          </h2>

          <p style={{ color: 'var(--muted)' }}>
            {appliedQ
              ? `No public posts matched “${appliedQ}.” Try a different search term.`
              : 'Be the first to share a before-and-after moment with the community.'}
          </p>

          {!appliedQ && (
            <Link to="/projects" className="button primary">
              Start a project
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Grid */}
          <div
            className="grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {items.map((it) => {
              if (it.type === 'single') {
                const showAttribution =
                  !!it.show_attribution &&
                  (!!it.attribution_name ||
                    (it.attribution_url && isSafeUrl(it.attribution_url)));

                const img = it.images[0];

                const cardContent = (
                  <>
                    {img?.src && (
                      <img
                        src={img.src}
                        alt={img.alt}
                        style={{
                          width: '100%',
                          height: 180,
                          objectFit: 'cover',
                          borderTopLeftRadius: 10,
                          borderTopRightRadius: 10,
                        }}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.src = '';
                        }}
                      />
                    )}

                    <div style={{ padding: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 16 }}>{it.caption}</h3>

                      <small style={{ color: '#666' }}>
                        {new Date(it.created_at).toLocaleString()}
                      </small>

                      {showAttribution && (
                        <small
                          style={{
                            display: 'block',
                            marginTop: 6,
                            color: 'var(--muted)',
                          }}
                        >
                          by <strong>{it.attribution_name || 'Anonymous'}</strong>

                          {it.attribution_url && isSafeUrl(it.attribution_url) && (
                            <>
                              {' · '}
                              <a
                                href={it.attribution_url}
                                onClick={(e) => e.stopPropagation()}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                              >
                                contact
                              </a>
                            </>
                          )}
                        </small>
                      )}

                      <ReactionBar item={it} />
                    </div>
                  </>
                );

                return (
                  <article className="card" key={it.key}>
                    {it.slug ? (
                      <Link
                        to={`/s/${it.slug}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        {cardContent}
                      </Link>
                    ) : (
                      cardContent
                    )}
                  </article>
                );
              }

              // Pair card: side-by-side, clickable to /p/:id
              if (it.type === 'pair') {
                return (
                  <article className="card" key={it.key}>
                    <Link
                      to={`/p/${it.id}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        <LabeledImage
                          bucket={MEDIA_BUCKET}
                          path={it.before_path}
                          alt="Before"
                          label="Before"
                          roundLeft
                          height={180}
                        />

                        <LabeledImage
                          bucket={MEDIA_BUCKET}
                          path={it.after_path}
                          alt="After"
                          label="After"
                          roundRight
                          height={180}
                        />
                      </div>

                      <div style={{ padding: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16 }}>{it.caption}</h3>

                        <small style={{ color: '#666' }}>
                          {new Date(it.created_at).toLocaleString()}
                        </small>

                        <ReactionBar item={it} />
                      </div>
                    </Link>
                  </article>
                );
              }

              return null;
            })}
          </div>

          {/* Load more */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: 16,
            }}
          >
            {canLoadMore && (
              <button
                className="button"
                onClick={() => fetchBatch({ reset: false })}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </>
      )}
    </PageLayout>
  );
}
