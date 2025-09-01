// src/routes/Community.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';
import BeforeAfterUploader from './BeforeAfterUploader';

const COMMUNITY_BUCKET = 'community'; // for single-image shares
const MEDIA_BUCKET = 'media';         // for before/after pairs
const PAGE_SIZE = 24;
const PER_TABLE_LIMIT = 24;

// ---------------- helpers ----------------
function isSafeUrl(u) {
  try {
    const url = new URL(u, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function publicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

// A tiny image component that tries public URL, then signed URL.
// It renders nothing unless an image successfully loads (so badges don’t float).
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

      // Fallback: signed URL (7 days)
      try {
        const { data, error } = await supabase
          .storage
          .from(bucket)
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (!cancelled && !error && data?.signedUrl) {
          setSrc(data.signedUrl);
        }
      } catch {
        /* ignore; onError below will log when it fails to load */
      }
    })();

    return () => { cancelled = true; };
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
          borderTopRightRadius: roundRight ? 10 : 0
        }}
        loading="lazy"
        decoding="async"
        onError={async () => {
          // One more attempt: force a fresh signed URL if the public URL 404’d
          if (triedSigned) {
            console.warn('[Community] image failed permanently:', { bucket, path, src });
            setSrc(null);
            return;
          }
          setTriedSigned(true);
          try {
            const { data, error } = await supabase
              .storage
              .from(bucket)
              .createSignedUrl(path, 60 * 60 * 24 * 7);
            if (!error && data?.signedUrl) {
              const bust = (data.signedUrl.includes('?') ? '&' : '?') + 'rb=' + Date.now();
              setSrc(data.signedUrl + bust);
            } else {
              console.warn('[Community] signed URL generation failed:', { bucket, path, error });
              setSrc(null);
            }
          } catch (e) {
            console.warn('[Community] signed URL error:', { bucket, path, e });
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
          fontSize: 12
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
        alt: row.caption || 'Community share'
      }
    ]
  };
}

// ---------------- page ----------------
export default function Community() {
  const [items, setItems] = useState([]);       // unified list (singles + pairs)
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [cursor, setCursor] = useState(null);   // ISO string of the smallest created_at in current list
  const [endReached, setEndReached] = useState(false);

  // Auth state for gating the uploader
  const [user, setUser] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setAppliedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  function applyCommonFilters(qb) {
    if (appliedQ) qb = qb.ilike('caption', `%${appliedQ}%`);
    if (cursor) qb = qb.lt('created_at', cursor);
    return qb;
  }

  async function fetchBatch({ reset = false } = {}) {
    try {
      if (reset) {
        setLoading(true);
        setItems([]);
        setCursor(null);
        setEndReached(false);
      } else {
        setLoadingMore(true);
      }

      // SHARES
      let sharesQ = supabase
        .from('shares')
        .select(
          'id, caption, media_path, slug, created_at, attribution_name, attribution_url, show_attribution',
        )
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(PER_TABLE_LIMIT);
      sharesQ = applyCommonFilters(sharesQ);

      const { data: sharesData, error: sharesErr } = await sharesQ;
      if (sharesErr) throw sharesErr;
      const mappedShares = (sharesData || []).map(mapShareRow);

      // BEFORE/AFTER PAIRS
      let pairsQ = supabase
        .from('before_after_pairs')
        .select('id, caption, before_path, after_path, created_at, is_public')
        .eq('is_public', true) // keep community feed public-only
        .order('created_at', { ascending: false })
        .limit(PER_TABLE_LIMIT);
      pairsQ = applyCommonFilters(pairsQ);

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
              (min, it) => (new Date(it.created_at) < new Date(min) ? it.created_at : min),
              pageSlice[0].created_at
            )
          : cursor;

      const exhausted =
        (mappedShares.length === 0 && mappedPairs.length === 0) || pageSlice.length === 0;

      if (reset) setItems(pageSlice);
      else setItems((prev) => [...prev, ...pageSlice]);

      setCursor(nextCursor);
      if (exhausted) setEndReached(true);
    } catch (err) {
      console.error(err);
      if (reset) {
        setItems([]);
        setEndReached(true);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchBatch({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedQ]);

  const canLoadMore = !endReached;

  return (
    <PageLayout title="Community" subtitle="Recent public shares & before/after results">
      {/* Search */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input"
          placeholder="Search captions…"
          aria-label="Search captions"
          style={{ flex: 1 }}
        />
        <button
          className="button ghost"
          onClick={() => { setQ(''); setAppliedQ(''); }}
          disabled={!q}
        >
          Clear
        </button>
      </div>

      {/* Uploader: only for signed-in users */}
      <section className="card" style={{ padding: 12, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Share Your Results</h2>
        {user ? (
          <BeforeAfterUploader onCreated={() => fetchBatch({ reset: true })} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>Please sign in to post a Before + After.</span>
            <Link to="/login" className="button">Sign in</Link>
          </div>
        )}
      </section>

      {/* States */}
      {loading ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>No public posts {appliedQ ? `matching “${appliedQ}”` : 'yet'}.</p>
      ) : (
        <>
          {/* Grid */}
          <div
            className="grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16
            }}
          >
            {items.map((it) => {
              if (it.type === 'single') {
                const showAttribution =
                  !!it.show_attribution &&
                  (!!it.attribution_name || (it.attribution_url && isSafeUrl(it.attribution_url)));

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
                          borderTopRightRadius: 10
                        }}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => { e.currentTarget.src = ''; }}
                      />
                    )}
                    <div style={{ padding: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 16 }}>{it.caption}</h3>
                      <small style={{ color: '#666' }}>
                        {new Date(it.created_at).toLocaleString()}
                      </small>
                      {showAttribution && (
                        <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>
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
                    </div>
                  </>
                );

                return (
                  <article className="card" key={it.key}>
                    {it.slug ? (
                      <Link to={`/s/${it.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        {cardContent}
                      </Link>
                    ) : (
                      cardContent
                    )}
                  </article>
                );
              }

              // Pair card (side-by-side) — clickable to /p/:id
              if (it.type === 'pair') {
                return (
                  <article className="card" key={it.key}>
                    <Link to={`/p/${it.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
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
                      </div>
                    </Link>
                  </article>
                );
              }

              return null;
            })}
          </div>

          {/* Load more */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
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
