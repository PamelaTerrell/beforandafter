import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';
import Guard from '../components/Guard';

const COMMUNITY_BUCKET = 'community';

export default function MyShares() {
  return <Guard><MySharesInner /></Guard>;
}

function MySharesInner() {
  const [user, setUser] = useState(null);
  const [shares, setShares] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

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

      const { data: pairRows, error: pairError } = await supabase
        .from('before_after_pairs')
        .select('id, caption, before_path, after_path, is_public, created_at')
        .eq('user_id', u.id)
        .order('created_at', { ascending: false });
      if (pairError) throw pairError;

      const withUrls = (data || []).map((row) => {
        if (!row.is_public) return { ...row, publicUrl: null };
        const { data: pub } = supabase.storage.from(COMMUNITY_BUCKET).getPublicUrl(row.media_path);
        return { ...row, publicUrl: pub?.publicUrl || null };
      });

      setShares(withUrls);
      setPairs(pairRows || []);
    } catch (e) {
      console.error(e);
      setErr(e?.message || 'Could not load shares');
      setShares([]);
      setPairs([]);
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
      setErr('');
      setNotice('');
      if (!user?.id) throw new Error('Your session expired. Please sign in again.');

      // 1) Mark as not public (restrict to current user for safety with RLS)
      const { data: updatedShare, error: upErr } = await supabase
        .from('shares')
        .update({ is_public: false })
        .eq('id', row.id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle();
      if (upErr || !updatedShare) throw upErr || new Error('This share could not be updated. Refresh and try again.');

      // 2) Remove the public file (the original stays in your private media bucket)
      if (row.media_path) {
        const { error: rmErr } = await supabase
          .storage
          .from(COMMUNITY_BUCKET)
          .remove([row.media_path]);
        if (rmErr) {
          setErr('The share is hidden from the gallery, but its public image could not be removed. Please retry or contact support.');
          await refresh();
          return;
        }
      }

      // 3) Update UI
      setShares(prev =>
        prev.map(s =>
          s.id === row.id ? { ...s, is_public: false, publicUrl: null } : s
        )
      );
      setNotice('Share hidden and public image removed. Previously copied links no longer work.');
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
      setErr('');
      setNotice('');
      if (!user?.id) throw new Error('Your session expired. Please sign in again.');

      const { data: hiddenShare, error: hideErr } = await supabase
        .from('shares')
        .update({ is_public: false })
        .eq('id', row.id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle();
      if (hideErr || !hiddenShare) throw hideErr || new Error('This share could not be updated. Refresh and try again.');

      if (row.media_path) {
        const { error: rmErr } = await supabase
          .storage
          .from(COMMUNITY_BUCKET)
          .remove([row.media_path]);
        if (rmErr) throw new Error('The share was hidden, but its public image could not be removed. Please retry deletion.');
      }

      const { data: deletedShare, error: delErr } = await supabase
        .from('shares')
        .delete()
        .eq('id', row.id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle();
      if (delErr || !deletedShare) throw delErr || new Error('This share could not be deleted. Refresh and try again.');

      setShares(prev => prev.filter(s => s.id !== row.id));
      setNotice('Share and public image permanently deleted.');
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Could not delete share');
    } finally {
      setBusyId(null);
    }
  }

  async function hidePair(row) {
    if (!confirm('Hide this Before & After from Community and break its public page?')) return;
    try {
      setBusyId(`pair:${row.id}`);
      setErr('');
      setNotice('');
      if (!user?.id) throw new Error('Your session expired. Please sign in again.');
      const { data: updatedPair, error } = await supabase
        .from('before_after_pairs')
        .update({ is_public: false })
        .eq('id', row.id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle();
      if (error || !updatedPair) throw error || new Error('This post could not be updated. Refresh and try again.');
      setPairs((previous) => previous.map((pair) => pair.id === row.id ? { ...pair, is_public: false } : pair));
      setNotice('Before & After hidden. Its public page is no longer available.');
    } catch (e) {
      setErr(e?.message || 'Could not hide this Before & After.');
    } finally {
      setBusyId(null);
    }
  }

  async function removePair(row) {
    if (!confirm('Permanently delete this Before & After and both uploaded images? This cannot be undone.')) return;
    try {
      setBusyId(`pair:${row.id}`);
      setErr('');
      setNotice('');
      if (!user?.id) throw new Error('Your session expired. Please sign in again.');

      const { data: hiddenPair, error: hideError } = await supabase
        .from('before_after_pairs')
        .update({ is_public: false })
        .eq('id', row.id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle();
      if (hideError || !hiddenPair) throw hideError || new Error('This post could not be updated. Refresh and try again.');

      const paths = [row.before_path, row.after_path].filter(Boolean);
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from('media').remove(paths);
        if (storageError) throw new Error('The post was hidden, but its images could not be removed. Please retry deletion.');
      }

      const { data: deletedPair, error: deleteError } = await supabase
        .from('before_after_pairs')
        .delete()
        .eq('id', row.id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle();
      if (deleteError || !deletedPair) throw deleteError || new Error('This post could not be deleted. Refresh and try again.');
      setPairs((previous) => previous.filter((pair) => pair.id !== row.id));
      setNotice('Before & After and both uploaded images permanently deleted.');
    } catch (e) {
      setErr(e?.message || 'Could not delete this Before & After.');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageLayout title="My Shares" subtitle="See exactly what is public, hide links, or permanently delete shared copies." noIndex>
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

      {notice && <p className="status-message success" role="status">{notice}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : !user ? null : shares.length === 0 && pairs.length === 0 ? (
        <div className="card">
          <p>You haven’t shared anything yet.</p>
          <Link to="/projects" className="button">Go to Projects</Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button className="button ghost" onClick={refresh}>Refresh</button>
          </div>

          {pairs.length > 0 && <section aria-labelledby="pair-shares-title">
            <h2 id="pair-shares-title">Before &amp; After posts</h2>
            <div className="grid grid--cards">
              {pairs.map((row) => {
                const pairBusy = busyId === `pair:${row.id}`;
                return (
                  <article className="card" key={row.id}>
                    <span className="badge">{row.is_public ? 'Public' : 'Hidden'}</span>
                    <h3>{row.caption || 'Untitled Before & After'}</h3>
                    <small>{new Date(row.created_at).toLocaleString()}</small>
                    <div className="card-actions">
                      {row.is_public && <Link to={`/p/${row.id}`} className="button ghost">Open public page</Link>}
                      {row.is_public && <button className="button" onClick={() => hidePair(row)} disabled={pairBusy}>{pairBusy ? 'Working…' : 'Unshare'}</button>}
                      <button className="button danger" onClick={() => removePair(row)} disabled={pairBusy}>{pairBusy ? 'Deleting…' : 'Delete permanently'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>}

          {shares.length > 0 && <section aria-labelledby="single-shares-title">
          <h2 id="single-shares-title">Shared project photos</h2>
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
                          aria-label={`Unshare ${row.caption || 'share'}`}
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
                      aria-label={`Delete ${row.caption || 'share'}`}
                    >
                      {busyId === row.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          </section>}
        </>
      )}
    </PageLayout>
  );
}
