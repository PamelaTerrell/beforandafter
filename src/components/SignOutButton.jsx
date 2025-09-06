// src/components/SignOutButton.jsx
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function SignOutButton({ className = 'button ghost' }) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    if (loading) return;
    setLoading(true);

    try {
      // 1) Sign out from Supabase (global = revoke across tabs)
      await supabase.auth.signOut({ scope: 'global' });
    } catch (e) {
      console.error('[signout] supabase', e);
      // Keep going — we’ll still clean up client-side.
    }

    try {
      // 2) Clean up any lingering local storage (oauthNext + sb-* tokens)
      localStorage.removeItem('oauthNext');
      // Supabase stores auth in a key like 'sb-<project-ref>-auth-token'
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('sb-')) localStorage.removeItem(k);
      }
      sessionStorage.clear();
    } catch (e) {
      console.warn('[signout] storage cleanup', e);
    }

    // 3) Hard reload to a clean Login page (prevents stale UI)
    const url = new URL('/login', window.location.origin);
    url.searchParams.set('mode', 'signin');
    url.searchParams.set('from', 'logout');
    // replace() avoids the user hitting Back to return to an authed page
    window.location.replace(url.toString());
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleSignOut}
      disabled={loading}
      aria-busy={loading}
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
