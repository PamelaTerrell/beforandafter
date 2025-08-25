import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const COMMUNITY_BUCKET = 'community';

export default function SharePage() {
  const { slug } = useParams();
  const [share, setShare] = useState(null);
  const [imgUrl, setImgUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);

      // Look up the public share by slug
      const { data, error } = await supabase
        .from('shares')
        .select('caption, media_path, created_at')
        .eq('slug', slug)
        .eq('is_public', true)
        .single();

      if (cancelled) return;

      if (error || !data) {
        setNotFound(true);
        setShare(null);
        setImgUrl(null);
        setLoading(false);
        return;
      }

      setShare(data);

      // Build a public URL for the community bucket object
      const { data: pub } = supabase
        .storage
        .from(COMMUNITY_BUCKET)
        .getPublicUrl(data.media_path);

      setImgUrl(pub?.publicUrl || null);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return <p style={{ padding: 16 }}>Loading…</p>;

  if (notFound) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
        <Link to="/" className="button ghost">← Home</Link>
        <h1 style={{ marginTop: 16 }}>Share not found</h1>
        <p style={{ marginTop: 8 }}>
          The link you followed may be broken or the share is no longer public.
        </p>
      </div>
    );
  }

  const pageUrl = `${window.location.origin}/s/${slug}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      alert('Link copied!');
    } catch {
      alert(pageUrl);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <Link to="/" className="button ghost">← Home</Link>
        <button className="button ghost" onClick={copyLink}>Copy link</button>
      </div>

      <h1 style={{ marginTop: 16 }}>Community Share</h1>

      {imgUrl && (
        <img
          src={imgUrl}
          alt={share?.caption || 'Community share'}
          style={{ width: '100%', borderRadius: 12, marginTop: 12 }}
          loading="lazy"
          decoding="async"
        />
      )}

      {share?.caption && <p style={{ marginTop: 12, fontSize: 18 }}>{share.caption}</p>}

      <small style={{ color: '#666' }}>
        Shared on {new Date(share.created_at).toLocaleString()}
      </small>
    </div>
  );
}
