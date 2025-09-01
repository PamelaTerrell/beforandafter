// src/routes/PairPage.jsx
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { supabase } from '../lib/supabase';

const COMMUNITY_BUCKET = 'community'; // public
const MEDIA_BUCKET = 'media';         // private

// Public URL helper (always returns a URL string; may 404 if object missing)
function publicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

// Create a 7-day signed URL from the private bucket (works when viewer is authorized)
async function resolvePrivateUrl(path) {
  if (!path) return null;
  try {
    const { data, error } = await supabase
      .storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!error) return data?.signedUrl || null;
  } catch {
    /* ignore */
  }
  return null;
}

export default function PairPage() {
  // NOTE: before_after_pairs.id is BIGINT; coerce the :id route param to a number
  const { id: idParam } = useParams(); // route: /p/:id
  const numericId = Number(idParam);

  const [pair, setPair] = useState(null);

  // primary URLs we actually render
  const [beforeUrl, setBeforeUrl] = useState(null);
  const [afterUrl,  setAfterUrl]  = useState(null);

  // fallbacks (private signed), used if public URLs 404
  const [fallbackBefore, setFallbackBefore] = useState(null);
  const [fallbackAfter,  setFallbackAfter]  = useState(null);

  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(numericId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);

    // Fetch the pair row
    const { data, error } = await supabase
      .from('before_after_pairs')
      .select('id, user_id, caption, before_path, after_path, created_at, is_public')
      // If you later want public-only, uncomment:
      // .eq('is_public', true)
      .eq('id', numericId)
      .single();

    if (error || !data) {
      setNotFound(true);
      setPair(null);
      setBeforeUrl(null);
      setAfterUrl(null);
      setLoading(false);
      return;
    }

    setPair(data);

    // Prefer public copies in the community bucket
    const pubBefore = publicUrl(COMMUNITY_BUCKET, `pairs/${data.id}/before.jpg`);
    const pubAfter  = publicUrl(COMMUNITY_BUCKET, `pairs/${data.id}/after.jpg`);

    // Prepare fallbacks from the private bucket (signed)
    const [signedBefore, signedAfter] = await Promise.all([
      resolvePrivateUrl(data.before_path),
      resolvePrivateUrl(data.after_path),
    ]);

    setFallbackBefore(signedBefore);
    setFallbackAfter(signedAfter);

    // Use public if available; the <img> onError will swap to fallback if it 404s
    setBeforeUrl(pubBefore || signedBefore || null);
    setAfterUrl(pubAfter || signedAfter || null);

    setLoading(false);
  }, [numericId]);

  useEffect(() => {
    load();
  }, [load]);

  const pageUrl = `${window.location.origin}/p/${idParam}`;
  const ogImage = afterUrl || beforeUrl || undefined;

  async function copyLink() {
    try { await navigator.clipboard.writeText(pageUrl); alert('Link copied!'); }
    catch { alert(pageUrl); }
  }

  if (loading) {
    return (
      <>
        <Helmet><title>Loading… · Before & After Vault</title></Helmet>
        <p style={{ padding: 16 }}>Loading…</p>
      </>
    );
  }

  if (notFound) {
    return (
      <div style={{ maxWidth: 860, margin: '40px auto', padding: 16 }}>
        <Helmet>
          <title>Post not found · Before & After Vault</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <Link to="/" className="button ghost">← Home</Link>
        <h1 style={{ marginTop: 16 }}>Post not found</h1>
        <p style={{ marginTop: 8 }}>
          The link you followed may be broken or the post is no longer public.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '40px auto', padding: 16 }}>
      <Helmet>
        <title>{pair?.caption ? `${pair.caption} · Before & After Vault` : 'Before & After · Vault'}</title>
        <meta name="description" content={pair?.caption || 'A before-and-after transformation.'} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={pair?.caption || 'Before & After'} />
        <meta property="og:description" content={pair?.caption || 'A before-and-after transformation.'} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:url" content={pageUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pair?.caption || 'Before & After'} />
        <meta name="twitter:description" content={pair?.caption || 'A before-and-after transformation.'} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
      </Helmet>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <Link to="/" className="button ghost">← Home</Link>
        <div style={{ display: 'flex', gap: 8 }}>
          {beforeUrl && <a className="button ghost" href={beforeUrl} target="_blank" rel="noopener noreferrer">Open Before</a>}
          {afterUrl && <a className="button ghost" href={afterUrl} target="_blank" rel="noopener noreferrer">Open After</a>}
          <button className="button ghost" onClick={copyLink}>Copy link</button>
        </div>
      </div>

      <h1 style={{ marginTop: 16 }}>Before &amp; After</h1>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        {beforeUrl && (
          <figure style={{ margin: 0, position: 'relative' }}>
            <img
              src={beforeUrl}
              alt="Before"
              style={{ width: '100%', borderRadius: 12 }}
              loading="lazy"
              decoding="async"
              onError={() => setBeforeUrl(fallbackBefore || null)}
            />
            <figcaption style={{
              position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.65)', color: '#fff',
              padding: '2px 8px', borderRadius: 999, fontSize: 12
            }}>Before</figcaption>
          </figure>
        )}
        {afterUrl && (
          <figure style={{ margin: 0, position: 'relative' }}>
            <img
              src={afterUrl}
              alt="After"
              style={{ width: '100%', borderRadius: 12 }}
              loading="lazy"
              decoding="async"
              onError={() => setAfterUrl(fallbackAfter || null)}
            />
            <figcaption style={{
              position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.65)', color: '#fff',
              padding: '2px 8px', borderRadius: 999, fontSize: 12
            }}>After</figcaption>
          </figure>
        )}
      </div>

      {pair?.caption && <p style={{ marginTop: 12, fontSize: 18 }}>{pair.caption}</p>}

      <small style={{ color: '#666' }}>
        Posted on {new Date(pair.created_at).toLocaleString()}
      </small>

      <style>{`
        @media (max-width: 720px) {
          .grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
