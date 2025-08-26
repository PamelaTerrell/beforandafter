import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { supabase } from '../lib/supabase';

const COMMUNITY_BUCKET = 'community';

// Safety: only allow http(s) or mailto links to render
function isSafeUrl(u) {
  try {
    const url = new URL(u, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
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
      <>
        <Helmet>
          <title>Loading… · Before & After Vault</title>
        </Helmet>
        <p style={{ padding: 16 }}>Loading…</p>
      </>
    );
  }

  if (notFound) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
        <Helmet>
          <title>Share not found · Before & After Vault</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <Link to="/" className="button ghost">← Home</Link>
        <h1 style={{ marginTop: 16 }}>Share not found</h1>
        <p style={{ marginTop: 8 }}>
          The link you followed may be broken or the share is no longer public.
        </p>
      </div>
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
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      {/* Social/meta tags */}
      <Helmet>
        <title>
          {share?.caption ? `${share.caption} · Before & After Vault` : 'Community Share · Before & After Vault'}
        </title>
        <meta name="description" content={share?.caption || 'A community before-and-after share.'} />
        <link rel="canonical" href={pageUrl} />

        <meta property="og:type" content="article" />
        <meta property="og:title" content={share?.caption || 'Community Share'} />
        <meta property="og:description" content={share?.caption || 'A community before-and-after share.'} />
        {imgUrl && <meta property="og:image" content={imgUrl} />}
        <meta property="og:url" content={pageUrl} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={share?.caption || 'Community Share'} />
        <meta name="twitter:description" content={share?.caption || 'A community before-and-after share.'} />
        {imgUrl && <meta name="twitter:image" content={imgUrl} />}
      </Helmet>

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

      <small style={{ color: '#666' }}>
        Shared on {new Date(share.created_at).toLocaleString()}
      </small>
    </div>
  );
}
