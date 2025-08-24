import { useEffect, useState } from 'react';
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

  // Put these PNGs in /public: kitchen.png, yard.png, tub.png, weightloss.png, facelift.png
  const gallery = [
    { src: '/kitchen.png',    title: 'Kitchen Makeover',    tag: 'Before → After', alt: 'Kitchen makeover split image: before and after' },
    { src: '/yard.png',       title: 'Backyard + Gazebo',   tag: 'Before → After', alt: 'Yard with new gazebo: before and after' },
    { src: '/tub.png',        title: 'Bathroom Refresh',    tag: 'Before → After', alt: 'Bathtub and tile refresh: before and after' },
    { src: '/weightloss.png', title: 'Weight Loss Journey', tag: 'Before → After', alt: 'Weight loss progress: before and after' },
    { src: '/facelift.png',   title: 'Facelift Result',     tag: 'Before → After', alt: 'Facelift result: before and after' },
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
                <img
                  src={item.src}
                  alt={item.alt}
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
    </PageLayout>
  );
}
