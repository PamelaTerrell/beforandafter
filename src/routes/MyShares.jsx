import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

const COMMUNITY_BUCKET = 'community';

export default function MyShares() {
  const [user, setUser] = useState(null);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');

  // Auth + live updates
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);
      const sub = supabase.auth.onAuthStateChange((_e, session) => {
        setUser(session?.user ?? null);
      });
      unsub = () => sub.data.subscription.unsubscribe();
    })();
    return () => unsub();
  }, []);

  const refresh = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) {
        setShares([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('shares')
        .select('id, slug, caption, media_path, is_public, created_at')
        .eq('user_id', u.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const withUrls = (data || []).map((row) => {
        const { data: pub } = supabase.storage.from(COMMUNITY_BUCKET).getPublicUrl(row.media_path);
        return { ...row, publicUrl: pub?.publicUrl || null };
      });

      setShares(withUrls);
    } catch (e) {
      console.error(e);
      setErr(e?.message || 'Could not load shares');
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + when user changes
  useEffect(() => {
    refresh();
  }, [refresh, user?.id]);

  async function copyLink(slug) {
    if (!slug) return;
    const url = `${window.location.origin}/s/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied!');
    } catch {
      alert(url);
    }
  }

  // Unshare: hide from Community AND remove the public copy from storage
  async function unshare(row) {
    if (!confirm('Hide this share from Community and break the public link?')) return;
    try {
      setBusyId(row.id);

      // 1) Mark as not public (restrict to current user for safety with RLS)
      const { error: upErr } = await supabase
        .from('shares')
        .update({ is_public: false })
        .eq('id', row.id);
        // .eq('user_id', user?.id); // optional extra guard if you want
      if (upErr) throw upErr;

      // 2) Remove the public file (the original stays in your private media bucket)
      if (row.media_path) {
        const { error: rmErr } = await supabase
          .storage
          .from(COMMUNITY_BUCKET)
          .remove([row.media_path]);
        if (rmErr) console.warn('Remove public file warning:', rmErr.message);
      }

      // 3) Update UI
      setShares(prev =>
        prev.map(s =>
          s.id === row.id ? { ...s, is_public: false, publicUrl: null } : s
        )
      );
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Could not unshare');
    } finally {
      setBusyId(null);
    }
  }

  // Delete: remove public file (if present) and delete the DB row
  async function removeShare(row) {
    if (!confirm('Permanently delete this share and its public image?')) return;
    try {
      setBusyId(row.id);

      if (row.media_path) {
        const { error: rmErr } = await supabase
          .storage
          .from(COMMUNITY_BUCKET)
          .remove([row.media_path]);
        if (rmErr) console.warn('Remove public file warning:', rmErr.message);
      }

      const { error: delErr } = await supabase
        .from('shares')
        .delete()
        .eq('id', row.id);
        // .eq('user_id', user?.id); // optional extra guard with RLS
      if (delErr) throw delErr;

      setShares(prev => prev.filter(s => s.id !== row.id));
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Could not delete share');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageLayout title="My Shares" subtitle="Manage what you've shared publicly">
      {/* Not signed in */}
      {!user && !loading && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p>You need to sign in to view and manage your shares.</p>
          <Link to="/login" className="button">Sign in</Link>
        </div>
      )}

      {err && (
        <div className="card" style={{ marginBottom: 16, borderColor: '#fecaca' }}>
          <p style={{ color: '#b91c1c' }}>{err}</p>
          <button className="button ghost" onClick={refresh}>Retry</button>
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : !user ? null : shares.length === 0 ? (
        <div className="card">
          <p>You haven’t shared anything yet.</p>
          <Link to="/projects" className="button">Go to Projects</Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button className="button ghost" onClick={refresh}>Refresh</button>
          </div>

          <div
            className="grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16
            }}
          >
            {shares.map(row => (
              <article className="card" key={row.id}>
                {row.publicUrl && (
                  <img
                    src={row.publicUrl}
                    alt={row.caption || 'Shared image'}
                    style={{
                      width: '100%',
                      height: 180,
                      objectFit: 'cover',
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10
                    }}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { e.currentTarget.src = ''; }} // avoid broken image icon
                  />
                )}
                <div style={{ padding: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{row.caption || 'Untitled'}</h3>
                  <small style={{ color: '#666' }}>
                    {new Date(row.created_at).toLocaleString()}
                  </small>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {row.is_public && row.slug ? (
                      <>
                        <Link to={`/s/${row.slug}`} className="button ghost">Open</Link>
                        <button
                          className="button ghost"
                          onClick={() => copyLink(row.slug)}
                          disabled={busyId === row.id}
                        >
                          Copy link
                        </button>
                        <button
                          className="button"
                          onClick={() => unshare(row)}
                          disabled={busyId === row.id}
                          aria-label="Unshare"
                        >
                          {busyId === row.id ? 'Working…' : 'Unshare'}
                        </button>
                      </>
                    ) : (
                      <span className="badge">Hidden</span>
                    )}

                    <button
                      className="button danger"
                      onClick={() => removeShare(row)}
                      disabled={busyId === row.id}
                      aria-label="Delete share"
                    >
                      {busyId === row.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </PageLayout>
  );
}
