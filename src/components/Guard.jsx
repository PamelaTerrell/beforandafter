import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Guard({ children }) {
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let sub;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) navigate('/login');
      setReady(true);
      sub = supabase.auth.onAuthStateChange((_e, session) => {
        if (!session) navigate('/login');
      }).data.subscription;
    })();
    return () => sub && sub.unsubscribe();
  }, [navigate]);

  return ready ? children : <div className="container"><p>Loading…</p></div>;
}
