import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function NavBar() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const nav = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setAuthReady(true);
    });
    // Keep in sync
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, next) => {
      setSession(next ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) return alert(error.message || 'Sign-out failed');
    nav('/login');
  }

  // Helper for consistent active styling on NavLink
  const linkClass = ({ isActive }) => 'navlink' + (isActive ? ' active' : '');

  // Consider "/s/:slug" as part of the Community section
  const communityIsActive =
    location.pathname === '/community' || location.pathname.startsWith('/s/');

  return (
    <header className="navbar">
      <div className="navbar__inner container">
        <div className="nav-left">
          <NavLink to="/" className="brand">Before &amp; After Vault</NavLink>

          <NavLink
            to="/projects"
            className={linkClass}
          >
            Projects
          </NavLink>

          {/* New: Community gallery link (also active on /s/:slug) */}
          <NavLink
            to="/community"
            className={'navlink' + (communityIsActive ? ' active' : '')}
          >
            Community
          </NavLink>
        </div>

        <div className="nav-right">
          {authReady && (session ? (
            <>
              <span className="nav-email">{session.user.email}</span>
              <button className="button ghost" onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <NavLink to="/login" className="navlink">Log in</NavLink>
          ))}
        </div>
      </div>
    </header>
  );
}
