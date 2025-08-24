import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Guard from '../components/Guard';
import NavBar from '../components/NavBar';
import { supabase } from '../lib/supabase';

export default function Project() {
  return (
    <>
      <NavBar />
      <Guard>
        <ProjectInner />
      </Guard>
    </>
  );
}

function ProjectInner() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState([]);
  const [kind, setKind] = useState('update');
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('projects').select('*').eq('id', id).single();
      setProject(p ?? null);
      const { data: e } = await supabase.from('entries').select('*').eq('project_id', id).order('taken_at', { ascending: true });
      setEntries(e ?? []);
    })();
  }, [id]);

  async function addEntry(e) {
    e.preventDefault();
    const { data, error } = await supabase.from('entries')
      .insert({ project_id: id, kind, note })
      .select().single();
    if (!error) {
      setEntries(prev => [...prev, data]);
      setNote('');
      setKind('update');
    }
  }

  if (!project) return <div className="container"><p>Loading…</p></div>;

  return (
    <div className="container">
      <h2>{project.title}</h2>
      <small>{project.category}</small>

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
        <textarea className="input" rows="3" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="button" type="submit">Add entry</button>
      </form>

      {entries.map(en => (
        <div className="card" key={en.id}>
          <b>{en.kind.toUpperCase()}</b> · <small>{new Date(en.taken_at).toLocaleString()}</small>
          {en.note && <p>{en.note}</p>}
        </div>
      ))}
    </div>
  );
}
