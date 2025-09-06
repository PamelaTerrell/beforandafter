// src/routes/AuthCallback.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

export default function AuthCallback() {
  const nav = useNavigate();
  const { search } = useLocation();
  const [msg, setMsg] = useState('Finishing sign-in…');

  useEffect(() => {
    let mounted = true;

    (async () => {
      const url = new URL(window.location.href);
      const params = url.searchParams;

      // 1) If an error came back in the URL, bounce to login with the message
      const rawErr = params.get('error_description') || params.get('error');
      if (rawErr) {
        if (!mounted) return;
        nav(`/login?error=${encodeURIComponent(rawErr)}`, { replace: true });
        return;
      }

      // 2) If we have an OAuth/magic-link "code", exchange it for a session (required for PKCE)
      const hasCode = params.get('code');
      if (hasCode) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) throw error;
        } catch (e) {
          if (!mounted) return;
          nav(`/login?error=${encodeURIComponent(e?.message || 'Could not complete sign-in.')}`, { replace: true });
          return;
        }
      }

      // 3) Give Supabase a brief moment to persist the session, then read it
      for (let i = 0; i < 20; i++) { // ~2s max
        const { data } = await supabase.auth.getSession();
        if (data?.session) break;
        await new Promise(r => setTimeout(r, 100));
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data?.session) {
        // Success → send to intended destination (saved before starting OAuth)
        const next = localStorage.getItem('oauthNext') || '/projects';
        localStorage.removeItem('oauthNext');
        nav(next, { replace: true });
        return;
      }

      // 4) No session present. If this was an email confirmation flow, show the sign-in prompt.
      const confirmed = params.get('confirmed') || params.get('type') === 'signup';
      if (confirmed) {
        nav('/login?confirmed=1', { replace: true });
      } else {
        // Direct visit or unknown state → nudge back to login
        nav('/login?mode=signin', { replace: true });
      }
    })();

    return () => { mounted = false; };
  }, [nav, search]);

  return (
    <PageLayout title="Connecting…">
      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <p aria-live="polite">{msg}</p>
      </div>
    </PageLayout>
  );
}
