import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

const COMMUNITY_BUCKET = 'community';

// Safety: only allow http(s) or mailto links to render
function isSafeUrl(u) {
  try {
    const url = new URL(u, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

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

      const { data, error } = await supabase
        .from('shares')
        .select('caption, media_path, created_at, attribution_name, attribution_url, show_attribution')
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

      const { data: pub } = supabase
        .storage
        .from(COMMUNITY_BUCKET)
        .getPublicUrl(data.media_path);

      setImgUrl(pub?.publicUrl || null);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [slug]);

  const pageUrl = `${window.location.origin}/s/${slug}`;

  if (loading) {
    return (
      <PageLayout title="Loading…" noIndex>
        <p className="loading-state" role="status">Loading public share…</p>
      </PageLayout>
    );
  }

  if (notFound) {
    return (
      <PageLayout title="Share not found" noIndex>
        <div className="empty-state">
          <h2>This share is no longer available</h2>
          <p>The link may be broken, or its owner may have made the share private.</p>
          <Link to="/community" className="button primary">Browse Community</Link>
        </div>
      </PageLayout>
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      alert('Link copied!');
    } catch {
      alert(pageUrl);
    }
  }

  const showAttribution =
    !!share?.show_attribution &&
    (!!share?.attribution_name || (share?.attribution_url && isSafeUrl(share.attribution_url)));

  return (
    <PageLayout title={share?.caption || 'Community Share'} description={share?.caption || 'A community before-and-after share.'} canonical={pageUrl} ogImage={imgUrl} ogType="article" noHeader>
      <article className="public-share-page">
      <div className="share-toolbar">
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

      {showAttribution && (
        <p style={{ marginTop: 8, color: 'var(--muted)' }}>
          Shared by <strong>{share.attribution_name || 'Anonymous'}</strong>
          {share.attribution_url && isSafeUrl(share.attribution_url) && (
            <>
              {' · '}
              <a
                href={share.attribution_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Contact
              </a>
            </>
          )}
        </p>
      )}

      <small>
        Shared on {new Date(share.created_at).toLocaleString()}
      </small>
      </article>
    </PageLayout>
  );
}
