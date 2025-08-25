import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

const COMMUNITY_BUCKET = 'community';
const PAGE_SIZE = 24;

export default function Community() {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(null);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');

  // For a tiny debounce without a library
  useEffect(() => {
    const t = setTimeout(() => setAppliedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const range = useMemo(() => {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    return { from, to };
  }, [page]);

  async function fetchPage(reset = false) {
    const isFirst = reset || page === 0;

    if (isFirst) {
      setLoading(true);
      setPage(0);
    } else {
      setLoadingMore(true);
    }

    let query = supabase
      .from('shares')
      .select('id, caption, media_path, slug, created_at', { count: 'exact' })
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (appliedQ) {
      // caption ILIKE %appliedQ%
      query = query.ilike('caption', `%${appliedQ}%`);
    }

    const { from, to } = isFirst ? { from: 0, to: PAGE_SIZE - 1 } : range;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error(error);
      if (isFirst) setShares([]);
      setTotal(0);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const withUrls = (data || []).map((row) => {
      const { data: pub } = supabase
        .storage
        .from(COMMUNITY_BUCKET)
        .getPublicUrl(row.media_path);
      return { ...row, publicUrl: pub?.publicUrl || null };
    });

    if (isFirst) {
      setShares(withUrls);
      setTotal(count ?? null);
      setLoading(false);
    } else {
      setShares(prev => [...prev, ...withUrls]);
      setLoadingMore(false);
    }
  }

  // Initial + when search changes
  useEffect(() => {
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedQ]);

  const canLoadMore =
    total != null ? shares.length < total : true; // safe fallback

  return (
    <PageLayout title="Community" subtitle="Recent public shares">
      {/* Search */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input"
          placeholder="Search captions…"
          aria-label="Search captions"
          style={{ flex: 1 }}
        />
        <button
          className="button ghost"
          onClick={() => { setQ(''); setAppliedQ(''); }}
          disabled={!q}
        >
          Clear
        </button>
      </div>

      {/* States */}
      {loading ? (
        <p>Loading…</p>
      ) : shares.length === 0 ? (
        <p>No public shares {appliedQ ? `matching “${appliedQ}”` : 'yet'}.</p>
      ) : (
        <>
          {/* Grid */}
          <div
            className="grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16
            }}
          >
            {shares.map((s) => (
              <article className="card" key={s.id}>
                <Link to={`/s/${s.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  {s.publicUrl && (
                    <img
                      src={s.publicUrl}
                      alt={s.caption || 'Community share'}
                      style={{
                        width: '100%',
                        height: 180,
                        objectFit: 'cover',
                        borderTopLeftRadius: 10,
                        borderTopRightRadius: 10
                      }}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <div style={{ padding: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>
                      {s.caption || 'Untitled'}
                    </h3>
                    <small style={{ color: '#666' }}>
                      {new Date(s.created_at).toLocaleString()}
                    </small>
                  </div>
                </Link>
              </article>
            ))}
          </div>

          {/* Load more */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            {canLoadMore && (
              <button
                className="button"
                onClick={() => {
                  setPage((p) => p + 1);
                  // fetch next page after state updates
                  setTimeout(() => fetchPage(false), 0);
                }}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </>
      )}
    </PageLayout>
  );
}
