import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Guard from '../components/Guard';
import PageLayout from '../components/PageLayout';
import { supabase } from '../lib/supabase';




export default function Projects() {
  return (
    <Guard>
      <ProjectsInner />
    </Guard>
  );
}

function ProjectsInner() {
  const [list, setList] = useState([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('other');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data, error: loadError } = await supabase
        .from('projects')
        .select('id, title, category, created_at')
        .eq('owner_id', userData.user.id)
        .order('created_at', { ascending: false });
      if (loadError) setError('We could not load your projects. Please try again.');
      setList(data ?? []);
      setLoading(false);
    })();
  }, []);

  async function createProject(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const cleanTitle = title.trim();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError('Your session expired. Please sign in again.');
      setSaving(false);
      return;
    }
    const { data, error: saveError } = await supabase
      .from('projects')
      .insert({ owner_id: userData.user.id, title: cleanTitle, category })
      .select('id, title, category, created_at')
      .single();
    if (!saveError) {
      setList(prev => [data, ...prev]);
      setTitle('');
      setCategory('other');
    } else {
      setError('We could not create that project. Please try again.');
    }
    setSaving(false);
  }

  return (
    <PageLayout title="Your projects" subtitle="Keep each transformation organized in one private place." noIndex>
      <form onSubmit={createProject} className="card form-card">
        <h2 className="section-title">Start a new project</h2>
        <div className="field">
          <label htmlFor="project-title">Project title</label>
          <input id="project-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
        </div>
        <div className="field">
          <label htmlFor="project-category">Category</label>
          <select id="project-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="home">Home</option>
            <option value="beauty">Beauty</option>
            <option value="fitness">Fitness</option>
            <option value="style">Style</option>
            <option value="other">Other</option>
          </select>
        </div>
        {error && <p className="status-message error" role="alert">{error}</p>}
        <button className="button primary" type="submit" disabled={saving || !title.trim()}>{saving ? 'Creating…' : 'Create project'}</button>
      </form>

      {loading ? <p className="loading-state" role="status">Loading your projects…</p> : list.length === 0 ? (
        <div className="empty-state"><h2>No projects yet</h2><p>Create your first project above and add a before photo when you’re ready.</p></div>
      ) : <div className="grid grid--cards project-grid">
        {list.map(p => (
          <Link className="card project-card" key={p.id} to={`/projects/${p.id}`}>
            <span className="badge">{p.category}</span>
            <h2>{p.title}</h2>
            <span className="text-link">Open project <span aria-hidden="true">→</span></span>
          </Link>
        ))}
      </div>}
    </PageLayout>
  );
}
