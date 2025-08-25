import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Guard from '../components/Guard';
import PageLayout from '../components/PageLayout';
import { supabase } from '../lib/supabase';

const MEDIA_BUCKET = 'media';         // private bucket (already set up)
const COMMUNITY_BUCKET = 'community'; // public bucket (you created)

// One slug helper (removed the duplicate)
function toSlug(s) {
  const base = (s || 'share')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const rand = Math.random().toString(36).slice(2, 7); // short random suffix
  return `${base}-${rand}`;
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
  if (file.size <= targetBytes) return file;

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

  // Load project + entries
  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('projects').select('*').eq('id', id).single();
      setProject(p ?? null);

      const { data: e } = await supabase
        .from('entries')
        .select('*')
        .eq('project_id', id)
        .order('taken_at', { ascending: true });
      setEntries(e ?? []);
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
    if (!f.type.startsWith('image/')) {
      setFileErr('Please choose an image file.');
      setFile(null);
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setFileErr('Image is larger than 25MB. Please pick a smaller file.');
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
    } catch (err) {
      console.error(err);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
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

      // 1) Delete the file (if any)
      if (en.media_path) {
        const { error: rmErr } = await supabase
          .storage
          .from(MEDIA_BUCKET)
          .remove([en.media_path]);
        if (rmErr) throw rmErr;
      }

      // 2) Delete the row
      const { error } = await supabase
        .from('entries')
        .delete()
        .eq('id', en.id);
      if (error) throw error;

      // 3) Update UI
      setEntries(prev => prev.filter(x => x.id !== en.id));
      setSignedUrls(prev => {
        const next = { ...prev };
        delete next[en.id];
        return next;
      });
    } catch (err) {
      alert(err?.message || 'Could not delete entry');
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  async function shareEntry(en) {
    try {
      setSharingId(en.id);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Not signed in');
      if (!en.media_path) throw new Error('This entry has no photo to share');

      const caption = window.prompt('Add a caption (optional):') || null;

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
          is_public: true
        });

      let { error: rowErr } = await insertShare(slug);
      if (rowErr && rowErr.code === '23505') {
        // unique violation on slug — try once more with a fresh slug
        slug = toSlug(`${baseForSlug}-alt`);
        ({ error: rowErr } = await insertShare(slug));
      }
      if (rowErr) throw rowErr;

      // 5) Build the pretty page URL and copy it
      const pageUrl = `${window.location.origin}/s/${slug}`;
      try {
        await navigator.clipboard.writeText(pageUrl);
        alert(`Shared! Link copied to clipboard:\n${pageUrl}`);
      } catch {
        alert(`Shared! Public page:\n${pageUrl}`);
      }
    } catch (e) {
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
    >
      {!project ? (
        <p>Loading…</p>
      ) : (
        <>
          <form onSubmit={addEntry} className="card">
            <div className="row">
              <label>Type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="before">Before</option>
                <option value="update">Update</option>
                <option value="after">After</option>
              </select>
            </div>

            <label>Note</label>
            <textarea
              className="input"
              rows={3}
              placeholder="What changed?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <label style={{ marginTop: 8 }}>Photo (optional)</label>
            <input
              className="input"
              type="file"
              accept="image/*"
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
