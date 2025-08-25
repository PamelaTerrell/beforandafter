import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function NavBar() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (menuOpen) document.body.classList.add('no-scroll');
    else document.body.classList.remove('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, [menuOpen]);

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) return alert(error.message || 'Sign-out failed');
    nav('/login');
  }

  const linkClass = ({ isActive }) => 'navlink' + (isActive ? ' active' : '');

  // Consider "/s/:slug" part of Community
  const communityIsActive =
    location.pathname === '/community' || location.pathname.startsWith('/s/');

  function onBackdropClick(e) {
    // close if clicking the dim backdrop
    if (e.target === e.currentTarget) setMenuOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') setMenuOpen(false);
  }

  return (
    <header className="navbar">
      <div className="navbar__inner container">
        <div className="nav-left">
          <NavLink to="/" className="brand">Before &amp; After Vault</NavLink>

          {/* Desktop links */}
          <nav className="nav-desktop">
            <NavLink to="/projects" className={linkClass}>
              Projects
            </NavLink>
            <NavLink
              to="/community"
              className={'navlink' + (communityIsActive ? ' active' : '')}
            >
              Community
            </NavLink>
            {session && (
              <NavLink to="/my-shares" className={linkClass}>
                My Shares
              </NavLink>
            )}
          </nav>
        </div>

        <div className="nav-right">
          {/* Desktop auth area */}
          {authReady && (
            <div className="nav-desktop">
              {session ? (
                <>
                  <span className="nav-email">{session.user.email}</span>
                  <button className="button ghost" onClick={handleSignOut}>Sign out</button>
                </>
              ) : (
                <NavLink to="/login" className="navlink">Log in</NavLink>
              )}
            </div>
          )}

          {/* Mobile toggle */}
          <button
            className="menu-toggle"
            aria-label="Menu"
            aria-controls="mobile-nav"
            aria-expanded={menuOpen ? 'true' : 'false'}
            onClick={() => setMenuOpen(v => !v)}
          >
            {/* simple burger / close icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              {menuOpen ? (
                <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              ) : (
                <path d="M4 6 H20 M4 12 H20 M4 18 H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu (overlay) */}
      <div
        id="mobile-nav"
        className={'mobile-nav' + (menuOpen ? ' open' : '')}
        role="dialog"
        aria-modal="true"
        onClick={onBackdropClick}
        onKeyDown={onKeyDown}
      >
        <div className="mobile-nav__panel" role="document" onClick={(e) => e.stopPropagation()}>
          <nav className="mobile-nav__links">
            <NavLink to="/projects" className={({ isActive }) => 'mnavlink' + (isActive ? ' active' : '')}>
              Projects
            </NavLink>
            <NavLink
              to="/community"
              className={'mnavlink' + (communityIsActive ? ' active' : '')}
            >
              Community
            </NavLink>
            {session && (
              <NavLink to="/my-shares" className={({ isActive }) => 'mnavlink' + (isActive ? ' active' : '')}>
                My Shares
              </NavLink>
            )}
            {!session && (
              <NavLink to="/login" className={({ isActive }) => 'mnavlink' + (isActive ? ' active' : '')}>
                Log in
              </NavLink>
            )}
          </nav>

          {session && (
            <div className="mobile-nav__footer">
              <div className="mobile-nav__email">{session.user.email}</div>
              <button className="button ghost" onClick={handleSignOut}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
