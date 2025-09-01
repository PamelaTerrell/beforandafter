// src/routes/Community.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';
import BeforeAfterUploader from './BeforeAfterUploader';

const COMMUNITY_BUCKET = 'community'; // for public single-image shares + public copies of pairs
const MEDIA_BUCKET = 'media';         // private originals for pairs
const PAGE_SIZE = 24;
const PER_TABLE_LIMIT = 24; // how many we pull from each table per batch

// Safety: only allow http(s) or mailto links to render
function isSafeUrl(u) {
  try {
    const url = new URL(u, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

// Get public URL for a storage object
function publicUrl(bucket, path) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

// Try public URL first, fall back to 7-day signed URL if bucket/object isn't public
async function resolveDisplayUrl(bucket, path) {
  if (!path) return null;
  try {
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    if (pub?.publicUrl) return pub.publicUrl;
  } catch {}
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!error) return data?.signedUrl || null;
  } catch {}
  return null;
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

  // Tiny debounce for search
  useEffect(() => {
    const t = setTimeout(() => setAppliedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Build the where-clause helpers
  function applyCommonFilters(queryBuilder) {
    if (appliedQ) queryBuilder = queryBuilder.ilike('caption', `%${appliedQ}%`);
    if (cursor) queryBuilder = queryBuilder.lt('created_at', cursor);
    return queryBuilder;
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

      // SHARES (single-image posts)
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

      // BEFORE/AFTER PAIRS — prefer public copies in COMMUNITY, else fall back to private MEDIA signed URLs
      let pairsQ = supabase
        .from('before_after_pairs')
        .select('id, caption, before_path, after_path, created_at, is_public')
        .order('created_at', { ascending: false })
        .limit(PER_TABLE_LIMIT);
      // If you *didn't* add is_public to the table, remove the next line:
      pairsQ = pairsQ.eq('is_public', true);
      pairsQ = applyCommonFilters(pairsQ);

      const { data: pairsData, error: pairsErr } = await pairsQ;
      if (pairsErr) throw pairsErr;

      const mappedPairs = await Promise.all(
        (pairsData || []).map(async (row) => {
          // Public copies written by the uploader: community/pairs/:id/before.jpg|after.jpg
          const beforePublic = publicUrl(COMMUNITY_BUCKET, `pairs/${row.id}/before.jpg`);
          const afterPublic  = publicUrl(COMMUNITY_BUCKET, `pairs/${row.id}/after.jpg`);

          const [beforeUrl, afterUrl] = await Promise.all([
            beforePublic || resolveDisplayUrl(MEDIA_BUCKET, row.before_path),
            afterPublic  || resolveDisplayUrl(MEDIA_BUCKET, row.after_path),
          ]);

          return {
            key: `pair:${row.id}`,
            type: 'pair',
            id: row.id,
            caption: row.caption || 'Untitled',
            created_at: row.created_at,
            images: [
              { src: beforeUrl, alt: 'Before' },
              { src: afterUrl,  alt: 'After'  }
            ]
          };
        })
      );

      // Merge + sort by created_at desc
      const merged = [...mappedShares, ...mappedPairs].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      // Take just PAGE_SIZE for this batch
      const pageSlice = merged.slice(0, PAGE_SIZE);

      // Determine next cursor (the oldest created_at we returned)
      const nextCursor =
        pageSlice.length > 0
          ? pageSlice.reduce(
              (min, it) => (new Date(it.created_at) < new Date(min) ? it.created_at : min),
              pageSlice[0].created_at
            )
          : cursor;

      // If both queries returned 0 and nothing sliced, we've reached the end
      const exhausted = (mappedShares.length === 0 && mappedPairs.length === 0) || pageSlice.length === 0;

      if (reset) {
        setItems(pageSlice);
      } else {
        setItems((prev) => [...prev, ...pageSlice]);
      }
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

  // Initial + when search changes
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
                    {img?.src ? (
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
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: 180,
                          background: 'var(--accent-soft)',
                          borderTopLeftRadius: 10,
                          borderTopRightRadius: 10
                        }}
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
                const [beforeImg, afterImg] = it.images;
                return (
                  <article className="card" key={it.key}>
                    <Link to={`/p/${it.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        {(beforeImg?.src ? (
                          <div style={{ position: 'relative' }}>
                            <img
                              src={beforeImg.src}
                              alt={beforeImg.alt}
                              style={{
                                width: '100%',
                                height: 180,
                                objectFit: 'cover',
                                borderTopLeftRadius: 10
                              }}
                              loading="lazy"
                              decoding="async"
                              onError={(e) => { e.currentTarget.src = ''; }}
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
                              Before
                            </span>
                          </div>
                        ) : (
                          <div style={{ height: 180, background: 'var(--accent-soft)', borderTopLeftRadius: 10 }} />
                        ))}

                        {(afterImg?.src ? (
                          <div style={{ position: 'relative' }}>
                            <img
                              src={afterImg.src}
                              alt={afterImg.alt}
                              style={{
                                width: '100%',
                                height: 180,
                                objectFit: 'cover',
                                borderTopRightRadius: 10
                              }}
                              loading="lazy"
                              decoding="async"
                              onError={(e) => { e.currentTarget.src = ''; }}
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
                              After
                            </span>
                          </div>
                        ) : (
                          <div style={{ height: 180, background: 'var(--accent-soft)', borderTopRightRadius: 10 }} />
                        ))}
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
