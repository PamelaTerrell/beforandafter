import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

const COMMUNITY_BUCKET = 'community';

export default function App() {
  const [email, setEmail] = useState(null);

  // Recent community shares (for the homepage strip)
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    // Auth badge
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Fetch a few recent public shares for the homepage
    (async () => {
      setRecentLoading(true);
      const { data, error } = await supabase
        .from('shares')
        .select('slug, caption, media_path, created_at')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(8);

      if (error || !data) {
        setRecent([]);
        setRecentLoading(false);
        return;
      }

      const withUrls = data.map(row => {
        const { data: pub } = supabase
          .storage
          .from(COMMUNITY_BUCKET)
          .getPublicUrl(row.media_path);
        return { ...row, publicUrl: pub?.publicUrl || null };
      });

      setRecent(withUrls);
      setRecentLoading(false);
    })();
  }, []);

  const gallery = [
    { src: '/kitchen.png',    title: 'Kitchen Makeover',    tag: 'Before → After', alt: 'Kitchen makeover split image: before and after' },
    { src: '/yard.png',       title: 'Backyard + Gazebo',   tag: 'Before → After', alt: 'Yard with new gazebo: before and after' },
    { src: '/tub.png',        title: 'Bathroom Refresh',    tag: 'Before → After', alt: 'Bathtub and tile refresh: before and after' },
    { src: '/weightloss.png', title: 'Weight Loss Journey', tag: 'Before → After', alt: 'Weight loss progress: before and after' },
    { src: '/facelift.png',   title: 'Facelift Result',     tag: 'Before → After', alt: 'Facelift result: before and after' },
    { src: '/beauty.png',     title: 'Creator Tutorial',    tag: 'Before → After', alt: 'Beauty tutorial creator, before and after' },
  ];

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
                <img src={item.src} alt={item.alt} loading="lazy" decoding="async" />
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
          {/* Was a disabled button; now a real link */}
          <Link to="/community" className="button ghost">Community Gallery</Link>
        </div>
      </section>

      {/* Latest from Community */}
      <section className="stack" style={{ marginTop: 16 }}>
        <h2>Latest from Community</h2>
        {recentLoading ? (
          <p>Loading…</p>
        ) : recent.length === 0 ? (
          <p>No public shares yet. Be the first to share from a project!</p>
        ) : (
          <div
            className="grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16
            }}
          >
            {recent.map((s) => (
              <article className="card" key={s.slug}>
                <Link to={`/s/${s.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  {s.publicUrl && (
                    <img
                      src={s.publicUrl}
                      alt={s.caption || 'Community share'}
                      style={{
                        width: '100%',
                        height: 160,
                        objectFit: 'cover',
                        borderTopLeftRadius: 10,
                        borderTopRightRadius: 10
                      }}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <div style={{ padding: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{s.caption || 'Untitled'}</h3>
                    <small style={{ color: '#666' }}>
                      {new Date(s.created_at).toLocaleString()}
                    </small>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <Link to="/community" className="button ghost">View all</Link>
          </div>
        )}
      </section>
    </PageLayout>
  );
}
