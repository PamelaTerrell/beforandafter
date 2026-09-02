import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Guard({ children }) {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let active = true;
    let authEventVersion = 0;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authEventVersion += 1;
      setStatus(session ? 'authorized' : 'unauthorized');
    });

    const checkVersion = authEventVersion;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventVersion !== checkVersion) return;
      setStatus(!error && data?.session ? 'authorized' : 'unauthorized');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (status === 'checking') {
    return <div className="container"><p>Loading…</p></div>;
  }

  if (status === 'unauthorized') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
