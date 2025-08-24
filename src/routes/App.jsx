import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import NavBar from '../components/NavBar';

export default function App() {
  const nav = useNavigate();

  // Track the real auth session and a "ready" flag
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Read current session on mount
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      setAuthReady(true);
    };
    init();

    // Keep session in sync on sign-in / sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(error.message || 'Sign-out failed');
      return;
    }
    setSession(null);
    nav('/login');
  }

  return (
    <div className="container">
      <nav className="nav">
        <Link to="/">Home</Link>
        <Link to="/projects">Projects</Link>

        {/* Only render auth controls once we know auth state */}
        {authReady && (
          session ? (
            <button className="button ghost" onClick={handleSignOut}>Sign out</button>
          ) : (
            <Link to="/login">Log in</Link>
          )
        )}
      </nav>

      <h1>Before & After Vault (basic)</h1>
      <p>Track transformations privately. Today: auth + text entries. Images come later.</p>

      {session?.user?.email && <small>Signed in as {session.user.email}</small>}
    </div>
  );
}
