import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Guard from '../components/Guard';
import NavBar from '../components/NavBar';
import { supabase } from '../lib/supabase';

export default function Projects() {
  return (
    <>
      <NavBar />
      <Guard>
        <ProjectsInner />
      </Guard>
    </>
  );
}

function ProjectsInner() {
  const [list, setList] = useState([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('other');

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      await supabase.from('profiles').upsert({ id: user.user.id, display_name: user.user.email }).select();
      const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      setList(data ?? []);
    })();
  }, []);

  async function createProject(e) {
    e.preventDefault();
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('projects')
      .insert({ owner_id: user.user.id, title, category })
      .select().single();
    if (!error) {
      setList(prev => [data, ...prev]);
      setTitle('');
      setCategory('other');
    }
  }

  return (
    <div className="container">
      <h2>Your Projects</h2>
      <form onSubmit={createProject} className="card">
        <label>Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <div className="row">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="home">Home</option>
            <option value="beauty">Beauty</option>
            <option value="fitness">Fitness</option>
            <option value="style">Style</option>
            <option value="other">Other</option>
          </select>
        </div>
        <button className="button" type="submit">Create</button>
      </form>

      {list.map(p => (
        <div className="card" key={p.id}>
          <b>{p.title}</b> <small>· {p.category}</small><br />
          <Link to={`/projects/${p.id}`}>Open</Link>
        </div>
      ))}
    </div>
  );
}
