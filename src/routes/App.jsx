import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';           // ⬅️ add this
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

export default function App() {
  const [email, setEmail] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const gallery = [
    { src: '/kitchen.png',    title: 'Kitchen Makeover',    tag: 'Before → After', alt: 'Kitchen makeover split image: before and after' },
    { src: '/yard.png',       title: 'Backyard + Gazebo',   tag: 'Before → After', alt: 'Yard with new gazebo: before and after' },
    { src: '/tub.png',        title: 'Bathroom Refresh',    tag: 'Before → After', alt: 'Bathtub and tile refresh: before and after' },
    { src: '/weightloss.png', title: 'Weight Loss Journey', tag: 'Before → After', alt: 'Weight loss progress: before and after' },
    { src: '/facelift.png',   title: 'Facelift Result',     tag: 'Before → After', alt: 'Facelift result: before and after' },
    { src: '/beauty.png',    title: 'Creator Tutorial',    tag: 'Before → After', alt: 'Beauty tutorial creator, before and after' }, // if you added the new one
  ];

  return (
    <PageLayout
      title="Before & After Vault"
      subtitle="Track private before-and-after transformations."
    >
      {email && <small>Signed in as {email}</small>}

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

     {/* SHARE NOTE (short + simple) */}
<section className="card ba-cta fade-up" style={{ marginTop: 16 }}>
  <h2>Share your wins</h2>
  <p>
    Your projects stay in your vault. If you’d like, you can share selected images to the
    <b> Community Gallery</b>.
  </p>
  <div className="ba-cta-actions">
    <Link to="/projects" className="button primary">Start a project</Link>
    <button className="button ghost" type="button" disabled title="Coming soon">
      Community Gallery · soon
    </button>
  </div>
</section>

    </PageLayout>
  );
}
