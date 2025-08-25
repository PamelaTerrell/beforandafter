import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Guard from '../components/Guard';
import PageLayout from '../components/PageLayout';
import { supabase } from '../lib/supabase';

const MEDIA_BUCKET = 'media'; // <-- match your bucket name exactly

export default function Project() {
  return (
    <Guard>
      <ProjectInner />
    </Guard>
  );
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

  // File select/preview + validation
  function onPickFile(e) {
    const f = e.target.files?.[0] ?? null;
    setFileErr(null);
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    if (!f) {
      setFile(null);
      return;
    }
    if (!f.type.startsWith('image/')) {
      setFileErr('Please choose an image file.');
      setFile(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setFileErr('Image is larger than 10MB. Please pick a smaller file.');
      setFile(null);
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
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
      const { data, error } = await supabase
        .from('entries')
        .insert({ project_id: id, kind, note, media_path })
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
              rows="3"
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
                  style={{ width: '100%', borderRadius: 10 }}
                />
              </div>
            )}
            <small>Tip: keep images &lt; 10MB for quicker uploads.</small>

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
                <b>{en.kind.toUpperCase()}</b>
                {' '}·{' '}
                <small>{new Date(en.taken_at).toLocaleString()}</small>
                {en.note && <p style={{ marginTop: 8 }}>{en.note}</p>}

                {en.media_path && signedUrls[en.id] && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={signedUrls[en.id]}
                      alt={`${en.kind} entry`}
                      style={{ width: '100%', borderRadius: 10 }}
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
