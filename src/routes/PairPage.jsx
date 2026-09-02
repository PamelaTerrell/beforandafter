// src/routes/PairPage.jsx
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

const COMMUNITY_BUCKET = 'community'; // public
const MEDIA_BUCKET = 'media';         // private
const SIGNED_URL_TTL = 10 * 60;

// Public URL helper (always returns a URL string; may 404 if object missing)
function publicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

// Short-lived fallback for older public pairs that have no public copy.
async function resolvePrivateUrl(path) {
  if (!path) return null;
  try {
    const { data, error } = await supabase
      .storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
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
      .eq('is_public', true)
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
  // Never place an expiring signed URL in share metadata.
  const ogImage = pair ? publicUrl(COMMUNITY_BUCKET, `pairs/${pair.id}/after.jpg`) : undefined;

  async function copyLink() {
    try { await navigator.clipboard.writeText(pageUrl); alert('Link copied!'); }
    catch { alert(pageUrl); }
  }

  if (loading) {
    return (
      <PageLayout title="Loading…" noIndex>
        <p className="loading-state" role="status">Loading public transformation…</p>
      </PageLayout>
    );
  }

  if (notFound) {
    return (
      <PageLayout title="Post not found" noIndex>
        <div className="empty-state">
          <h2>This transformation is no longer available</h2>
          <p>The link may be broken, or its owner may have made the post private.</p>
          <Link to="/community" className="button primary">Browse Community</Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={pair?.caption || 'Before & After'} description={pair?.caption || 'A before-and-after transformation.'} canonical={pageUrl} ogImage={ogImage} ogType="article" noHeader>
      <article className="public-share-page public-share-page--wide">
      <div className="share-toolbar">
        <Link to="/" className="button ghost">← Home</Link>
        <div className="share-toolbar__actions">
          {beforeUrl && <a className="button ghost" href={beforeUrl} target="_blank" rel="noopener noreferrer">Open Before</a>}
          {afterUrl && <a className="button ghost" href={afterUrl} target="_blank" rel="noopener noreferrer">Open After</a>}
          <button className="button ghost" onClick={copyLink}>Copy link</button>
        </div>
      </div>

      <h1 style={{ marginTop: 16 }}>Before &amp; After</h1>

      <div className="pair-comparison">
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

      <small>
        Posted on {new Date(pair.created_at).toLocaleString()}
      </small>

      </article>
    </PageLayout>
  );
}
