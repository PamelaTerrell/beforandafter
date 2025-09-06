// src/routes/App.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

const COMMUNITY_BUCKET = 'community'; // single-image shares (public)
const MEDIA_BUCKET = 'media';         // before/after pairs (private)
const HOMEPAGE_LIMIT = 8;
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

/* ---------- URL helpers ---------- */

// Community bucket is public: a simple public URL is fine
function publicUrl(bucket, path) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

// Batch sign many media paths at once (fewer requests = faster)
async function resolveMediaUrls(paths) {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return new Map();
  const { data, error } = await supabase
    .storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(clean, SIGNED_URL_TTL);

  if (error) {
    console.error('[Home] createSignedUrls error:', error);
    return new Map();
  }

  const map = new Map();
  data?.forEach((d, i) => {
    const key = clean[i];
    map.set(key, d?.signedUrl ?? null);
  });
  return map;
}

// Normalize single-image "shares" row
function mapShareRow(row) {
  return {
    key: `share:${row.slug}`,
    type: 'single',
    id: row.slug,
    caption: row.caption || 'Untitled',
    created_at: row.created_at,
    href: `/s/${row.slug}`,
    image: {
      src: publicUrl(COMMUNITY_BUCKET, row.media_path),
      alt: row.caption || 'Community share',
    },
  };
}

// Normalize before/after pair; URLs filled after signing
function mapPairRow(row) {
  return {
    key: `pair:${row.id}`,
    type: 'pair',
    id: row.id, // bigint id, used in /p/:id
    caption: row.caption || 'Untitled',
    created_at: row.created_at,
    href: `/p/${row.id}`,
    before_path: row.before_path,
    after_path: row.after_path,
    beforeUrl: null,
    afterUrl: null,
  };
}

export default function App() {
  const [email, setEmail] = useState(null);
  const [items, setItems] = useState([]); // mixed list (singles + pairs)
  const [loading, setLoading] = useState(true);

  // pretty date formatter (locale-aware)
  const fmt = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    []
  );

  // auth badge
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setEmail(data.session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Fetch both feeds, merge, sort, slice
  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);

        // 1) Latest single-image shares
        const { data: shares, error: sharesErr } = await supabase
          .from('shares')
          .select('slug, caption, media_path, created_at')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(HOMEPAGE_LIMIT);

        if (ac.signal.aborted) return;
        if (sharesErr) console.error('[Home] shares error:', sharesErr);
        const mappedShares = (shares || []).map(mapShareRow);

        // 2) Latest before/after pairs (public)
        const { data: pairs, error: pairsErr } = await supabase
          .from('before_after_pairs')
          .select('id, caption, before_path, after_path, created_at, is_public')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(HOMEPAGE_LIMIT);

        if (ac.signal.aborted) return;
        if (pairsErr) console.error('[Home] pairs error:', pairsErr);

        const mappedPairs = (pairs || []).map(mapPairRow);

        // Batch sign all before/after paths in one go
        const allPaths = mappedPairs.flatMap(p => [p.before_path, p.after_path]).filter(Boolean);
        const signedMap = await resolveMediaUrls(allPaths);

        if (ac.signal.aborted) return;

        // Attach signed URLs & drop pairs with no resolvable media
        const cleanedPairs = mappedPairs
          .map(p => ({
            ...p,
            beforeUrl: p.before_path ? signedMap.get(p.before_path) ?? null : null,
            afterUrl:  p.after_path  ? signedMap.get(p.after_path)  ?? null : null,
          }))
          .filter(p => p.beforeUrl || p.afterUrl);

        // 3) Merge + sort by created_at desc, keep HOMEPAGE_LIMIT
        const merged = [...mappedShares, ...cleanedPairs].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );

        if (!ac.signal.aborted) {
          setItems(merged.slice(0, HOMEPAGE_LIMIT));
          setLoading(false);
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          console.error('[Home] load error:', e);
          setLoading(false);
        }
      }
    })();

    return () => ac.abort();
  }, []);

  const gallery = useMemo(() => ([
    { src: '/kitchen.png',    title: 'Kitchen Makeover',    tag: 'Before → After', alt: 'Kitchen makeover split image: before and after' },
    { src: '/yard.png',       title: 'Backyard + Gazebo',   tag: 'Before → After', alt: 'Yard with new gazebo: before and after' },
    { src: '/tub.png',        title: 'Bathroom Refresh',    tag: 'Before → After', alt: 'Bathtub and tile refresh: before and after' },
    { src: '/weightloss.png', title: 'Weight Loss Journey', tag: 'Before → After', alt: 'Weight loss progress: before and after' },
    { src: '/facelift.png',   title: 'Facelift Result',     tag: 'Before → After', alt: 'Facelift result: before and after' },
    { src: '/beauty.png',     title: 'Creator Tutorial',    tag: 'Before → After', alt: 'Beauty tutorial creator, before and after' },
  ]), []);

  return (
    <PageLayout
      title="Before & After Vault"
      subtitle="Track private before-and-after transformations."
    >
      {email && <small>Signed in as {email}</small>}

      {/* Static showcase */}
      <section className="stack ba-gallery">
        <div className="grid grid--cards">
          {gallery.map((item) => (
            <figure className="card ba-card" key={item.src}>
              <div className="ba-media">
                <img
                  src={item.src}
                  alt={item.alt || item.title}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption className="ba-caption">
                <strong>{item.title}</strong>
                <span className="badge">{item.tag}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Share CTA */}
      <section className="card ba-cta fade-up" style={{ marginTop: 16 }}>
        <h2>Share your wins</h2>
        <p>
          Your projects stay in your vault. If you’d like, you can share selected images to the
          <b> Community Gallery</b>.
        </p>
        <div className="ba-cta-actions">
          <Link to="/projects" className="button primary">Start a project</Link>
          <Link to="/community" className="button ghost">Community Gallery</Link>
        </div>
      </section>

      {/* Latest from Community (mixed singles + pairs) */}
      <section className="stack" style={{ marginTop: 16 }}>
        <h2>Latest from Community</h2>

        {loading ? (
          <p>Loading…</p>
        ) : items.length === 0 ? (
          <p>No public posts yet. Be the first to share!</p>
        ) : (
          <div
            className="grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16
            }}
          >
            {items.map((it) => {
              // Single-image card
              if (it.type === 'single') {
                return (
                  <article className="card" key={it.key}>
                    <Link to={it.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                      {it.image?.src ? (
                        <img
                          src={it.image.src}
                          alt={it.image.alt || it.caption}
                          style={{
                            width: '100%',
                            height: 160,
                            objectFit: 'cover',
                            borderTopLeftRadius: 10,
                            borderTopRightRadius: 10
                          }}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : null}
                      <div style={{ padding: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16 }}>{it.caption}</h3>
                        <small style={{ color: '#666' }}>
                          {fmt.format(new Date(it.created_at))}
                        </small>
                      </div>
                    </Link>
                  </article>
                );
              }

              // Before/After pair card
              const before = it.beforeUrl;
              const after  = it.afterUrl;
              return (
                <article className="card" key={it.key}>
                  <Link to={it.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                      {before && (
                        <div style={{ position: 'relative' }}>
                          <img
                            src={before}
                            alt="Before"
                            style={{
                              width: '100%',
                              height: 160,
                              objectFit: 'cover',
                              borderTopLeftRadius: 10
                            }}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
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
                      )}
                      {after && (
                        <div style={{ position: 'relative' }}>
                          <img
                            src={after}
                            alt="After"
                            style={{
                              width: '100%',
                              height: 160,
                              objectFit: 'cover',
                              borderTopRightRadius: 10
                            }}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
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
                      )}
                    </div>

                    <div style={{ padding: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 16 }}>{it.caption}</h3>
                      <small style={{ color: '#666' }}>
                        {fmt.format(new Date(it.created_at))}
                      </small>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <Link to="/community" className="button ghost">View all</Link>
          </div>
        )}
      </section>
    </PageLayout>
  );
}
