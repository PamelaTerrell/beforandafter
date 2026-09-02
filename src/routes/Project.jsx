import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Guard from '../components/Guard';
import PageLayout from '../components/PageLayout';
import { supabase } from '../lib/supabase';
import { validateImageFile } from '../lib/mediaValidation';

const MEDIA_BUCKET = 'media';         // private bucket (already set up)
const COMMUNITY_BUCKET = 'community'; // public bucket (you created)

// Slug helper
function toSlug(s) {
  const base = (s || 'share')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const rand = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  return `${base}-${rand}`;
}

// Contact normalizer: returns URL, mailto:, or null if unrecognized
function normalizeContact(input) {
  const s = (input || '').trim();
  if (!s) return null;

  if (/^mailto:/i.test(s)) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.slice(7)) ? s : null;
  }

  if (/^https?:\/\//i.test(s) || /^\/\//i.test(s)) {
    try {
      const url = new URL(s.startsWith('//') ? `https:${s}` : s);
      if (url.username || url.password) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  // email-like (simple)
  const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailLike.test(s)) return `mailto:${s}`;

  // bare domain
  const bareDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (bareDomain.test(s)) return `https://${s}`;

  // Anything else (e.g., @handle) -> ignore to avoid broken links
  return null;
}

export default function Project() {
  return (
    <Guard>
      <ProjectInner />
    </Guard>
  );
}

/** Downscale + recompress an image File to reduce size aggressively. */
async function downscaleImage(
  file,
  {
    maxWidth = 600,
    maxHeight = 600,
    startQuality = 0.82,
    floorQuality = 0.55,
    targetBytes = 150 * 1024, // ≈150 KB
    preferFormat = 'image/webp',
  } = {}
) {
  let bitmap = null;
  try {
    if ('createImageBitmap' in window) {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    }
  } catch {
    bitmap = null;
  }

  let imgEl = null;
  if (!bitmap) {
    imgEl = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  const srcW = bitmap ? bitmap.width : imgEl.naturalWidth;
  const srcH = bitmap ? bitmap.height : imgEl.naturalHeight;
  const scale = Math.min(maxWidth / srcW, maxHeight / srcH, 1);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (bitmap) ctx.drawImage(bitmap, 0, 0, dstW, dstH);
  else {
    ctx.drawImage(imgEl, 0, 0, dstW, dstH);
    URL.revokeObjectURL(imgEl.src);
  }

  async function encode(format, quality) {
    const blob = await new Promise((res) => canvas.toBlob(res, format, quality));
    return blob;
  }

  let format = preferFormat;
  let q = startQuality;
  let blob = await encode(format, q);

  if (!blob || blob.size === 0 || !blob.type.includes('image')) {
    format = 'image/jpeg';
    q = startQuality;
    blob = await encode(format, q);
  }

  while (blob && blob.size > targetBytes && q > floorQuality) {
    q = Math.max(floorQuality, q - 0.1);
    const next = await encode(format, q);
    if (!next) break;
    blob = next;
  }

  if (!blob) return file;

  const ext = format.includes('webp') ? 'webp' : 'jpg';
  const newName = file.name.replace(/\.\w+$/, '') + '.' + ext;
  return new File([blob], newName, { type: blob.type, lastModified: Date.now() });
}

function ProjectInner() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState([]);
  const [kind, setKind] = useState('before'); // 'before' | 'update' | 'after'
  const [note, setNote] = useState('');

  // upload bits
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileErr, setFileErr] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [sharingId, setSharingId] = useState(null);
  const [signedUrls, setSignedUrls] = useState({}); // { entryId: url }
  const [loadState, setLoadState] = useState('loading');

  // Load project + entries
  useEffect(() => {
    (async () => {
      setLoadState('loading');
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: p } = await supabase
        .from('projects')
        .select('id, owner_id, title, category, created_at')
        .eq('id', id)
        .eq('owner_id', userData.user.id)
        .maybeSingle();
      setProject(p ?? null);
      if (!p) {
        setLoadState('not-found');
        return;
      }

      const { data: e } = await supabase
        .from('entries')
        .select('*')
        .eq('project_id', id)
        .order('taken_at', { ascending: true });
      setEntries(e ?? []);
      setLoadState('ready');
    })();
  }, [id]);

  // Get signed URLs for images
  useEffect(() => {
    (async () => {
      const map = {};
      const toFetch = (entries || []).filter(en => en.media_path);
      await Promise.all(
        toFetch.map(async (en) => {
          const { data, error } = await supabase
            .storage
            .from(MEDIA_BUCKET)
            .createSignedUrl(en.media_path, 60 * 60); // 1 hour
          if (!error && data?.signedUrl) map[en.id] = data.signedUrl;
        })
      );
      setSignedUrls(map);
    })();
  }, [entries]);

  // File select/preview + validation + DOWNSCALE
  async function onPickFile(e) {
    const f = e.target.files?.[0] ?? null;
    setFileErr(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (!f) {
      setFile(null);
      return;
    }
    const validationError = validateImageFile(f);
    if (validationError) {
      setFileErr(validationError);
      setFile(null);
      return;
    }

    try {
      const small = await downscaleImage(f, {
        maxWidth: 600,
        maxHeight: 600,
        startQuality: 0.8,
        floorQuality: 0.55,
        targetBytes: 150 * 1024,
        preferFormat: 'image/webp',
      });
      setFile(small);
      setPreviewUrl(URL.createObjectURL(small));
    } catch {
      setFileErr('We could not process that image. Please choose another JPEG, PNG, or WebP file.');
      setFile(null);
    }
  }

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function addEntry(e) {
    e.preventDefault();
    setUploading(true);
    let uploadedPath = null;
    try {
      // Upload file if present
      let media_path = null;
      if (file) {
        const { data: userData, error: uerr } = await supabase.auth.getUser();
        if (uerr || !userData?.user) throw uerr || new Error('Not signed in');
        const userId = userData.user.id;

        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const filename = `${crypto.randomUUID()}.${ext}`;
        media_path = `${userId}/${id}/${filename}`; // userId must be first segment for RLS
        uploadedPath = media_path;

        const { error: upErr } = await supabase
          .storage
          .from(MEDIA_BUCKET)
          .upload(media_path, file, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;
      }

      // Insert entry row
      const payload = { project_id: id, kind, note };
      if (media_path) payload.media_path = media_path;

      const { data, error } = await supabase
        .from('entries')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      uploadedPath = null;

      // Refresh UI
      setEntries(prev => [...prev, data]);
      setNote('');
      setKind('update');
      setFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } catch (err) {
      if (uploadedPath) {
        await supabase.storage.from(MEDIA_BUCKET).remove([uploadedPath]);
      }
      alert(err?.message || 'Could not add entry');
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  async function deleteEntry(en) {
    if (!confirm('Delete this entry?')) return;

    try {
      setDeletingId(en.id);

      // Remove the row first so a storage cleanup failure cannot leave a broken entry.
      const { data: deletedEntry, error } = await supabase
        .from('entries')
        .delete()
        .eq('id', en.id)
        .eq('project_id', id)
        .select('id')
        .maybeSingle();
      if (error || !deletedEntry) throw error || new Error('This entry could not be deleted. Refresh and try again.');

      let cleanupWarning = false;
      if (en.media_path) {
        const { error: rmErr } = await supabase.storage.from(MEDIA_BUCKET).remove([en.media_path]);
        cleanupWarning = Boolean(rmErr);
      }

      setEntries(prev => prev.filter(x => x.id !== en.id));
      setSignedUrls(prev => {
        const next = { ...prev };
        delete next[en.id];
        return next;
      });
      if (cleanupWarning) alert('Entry deleted, but its private stored image could not be cleaned up.');
    } catch (err) {
      alert(err?.message || 'Could not delete entry');
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  async function shareEntry(en) {
    let uploadedPublicPath = null;
    try {
      setSharingId(en.id);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Not signed in');
      if (!en.media_path) throw new Error('This entry has no photo to share');

      const caption = window.prompt('Add a caption (optional):') || null;

      // NEW: optional display name + contact
      const attribution_name = (window.prompt('Display name (optional, leave blank to stay anonymous):') || '').trim() || null;
      const rawContact = window.prompt('Contact link (optional — website, IG, or email):') || '';
      const attribution_url = normalizeContact(rawContact);
      const show_attribution = !!(attribution_name || attribution_url);

      // 1) Signed URL for private image (short-lived)
      const { data: sig, error: sigErr } = await supabase
        .storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(en.media_path, 60);
      if (sigErr || !sig?.signedUrl) throw sigErr || new Error('Could not sign URL');

      // 2) Download blob
      const resp = await fetch(sig.signedUrl);
      if (!resp.ok) throw new Error('Failed to fetch private image');
      const blob = await resp.blob();

      // 3) Upload to public community bucket
      const ext = blob.type.includes('webp') ? 'webp'
                : blob.type.includes('png')  ? 'png'
                : 'jpg';
      const public_path = `${userId}/${en.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase
        .storage
        .from(COMMUNITY_BUCKET)
        .upload(public_path, blob, { contentType: blob.type, upsert: false });
      if (upErr) throw upErr;
      uploadedPublicPath = public_path;

      // 4) Create slug & insert share row (retry once if slug collides)
      const baseForSlug =
        (project?.title ? `${project.title}-${en.kind}` : en.kind) || 'share';
      let slug = toSlug(baseForSlug);

      const insertShare = async (sl) =>
        supabase.from('shares').insert({
          user_id: userId,
          caption,
          media_path: public_path, // path within COMMUNITY bucket
          slug: sl,
          is_public: true,
          attribution_name,
          attribution_url,
          show_attribution
        });

      let { error: rowErr } = await insertShare(slug);
      if (rowErr && rowErr.code === '23505') {
        // unique violation on slug — try once more with a fresh slug
        slug = toSlug(`${baseForSlug}-alt`);
        ({ error: rowErr } = await insertShare(slug));
      }
      if (rowErr) throw rowErr;
      uploadedPublicPath = null;

      // 5) Build the pretty page URL and copy it
      const pageUrl = `${window.location.origin}/s/${slug}`;
      try {
        await navigator.clipboard.writeText(pageUrl);
        alert(`Shared! Link copied to clipboard:\n${pageUrl}`);
      } catch {
        alert(`Shared! Public page:\n${pageUrl}`);
      }
    } catch (e) {
      if (uploadedPublicPath) {
        await supabase.storage.from(COMMUNITY_BUCKET).remove([uploadedPublicPath]);
      }
      console.error(e);
      alert(e?.message || 'Could not share this entry');
    } finally {
      setSharingId(null);
    }
  }

  return (
    <PageLayout
      title={project ? project.title : 'Project'}
      subtitle={project ? project.category : undefined}
      noIndex
    >
      {loadState === 'loading' ? (
        <p className="loading-state" role="status">Loading project…</p>
      ) : loadState === 'not-found' ? (
        <div className="empty-state"><h2>Project not found</h2><p>This project may have been removed, or you may not have access to it.</p></div>
      ) : (
        <>
          <form onSubmit={addEntry} className="card">
            <div className="row">
              <label htmlFor="entry-type">Entry type</label>
              <select id="entry-type" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="before">Before</option>
                <option value="update">Update</option>
                <option value="after">After</option>
              </select>
            </div>

            <label htmlFor="entry-note">Note</label>
            <textarea
              id="entry-note"
              className="input"
              rows={3}
              placeholder="What changed?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <label htmlFor="entry-photo" style={{ marginTop: 8 }}>Photo (optional)</label>
            <input
              id="entry-photo"
              className="input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickFile}
            />
            {fileErr && <p style={{ color: 'crimson', marginTop: 8 }} aria-live="polite">{fileErr}</p>}
            {previewUrl && (
              <div style={{ marginTop: 8 }}>
                <img
                  src={previewUrl}
                  alt="Selected preview"
                  style={{ width: '100%', borderRadius: 10, maxWidth: 480, marginInline: 'auto' }}
                />
              </div>
            )}
            <small>Images are optimized on upload (~600px, ~≤150KB).</small>

            <div style={{ marginTop: 12 }}>
              <button className="button primary" type="submit" disabled={uploading}>
                {uploading ? 'Uploading…' : 'Add entry'}
              </button>
            </div>
          </form>

          {/* Entries list */}
          <div className="grid" style={{ marginTop: 16, gap: '16px' }}>
            {entries.map(en => (
              <div className="card" key={en.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <b>{en.kind.toUpperCase()}</b>
                    {' '}·{' '}
                    <small>{new Date(en.taken_at).toLocaleString()}</small>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="button ghost"
                      onClick={() => shareEntry(en)}
                      disabled={sharingId === en.id}
                    >
                      {sharingId === en.id ? 'Sharing…' : 'Share'}
                    </button>
                    <button
                      className="button ghost"
                      onClick={() => deleteEntry(en)}
                      disabled={deletingId === en.id}
                      aria-label="Delete entry"
                    >
                      {deletingId === en.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>

                {en.note && <p style={{ marginTop: 8 }}>{en.note}</p>}

                {en.media_path && signedUrls[en.id] && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={signedUrls[en.id]}
                      alt={`${en.kind} entry`}
                      style={{ width: '100%', borderRadius: 10, maxWidth: 480, marginInline: 'auto' }}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </PageLayout>
  );
}
