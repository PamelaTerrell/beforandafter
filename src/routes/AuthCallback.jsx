import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';
import {
  captureAuthCallbackParameters,
  clearCapturedAuthCallbackParameters,
  getCapturedAuthCallbackParameters,
  getSafeRedirect,
} from '../lib/authRouting';

export default function AuthCallback() {
  const nav = useNavigate();

  useEffect(() => {
    let mounted = true;

    async function handleAuthCallback() {
      const callback =
        getCapturedAuthCallbackParameters() || captureAuthCallbackParameters();
      const rawErr = callback?.error;
      const code = callback?.code;
      const type = callback?.type;
      const accessToken = callback?.accessToken;
      const refreshToken = callback?.refreshToken;
      clearCapturedAuthCallbackParameters();

      if (rawErr) {
        if (!mounted) return;
        nav('/login', { replace: true, state: { authError: rawErr } });
        return;
      }

      try {
        // PKCE flows: OAuth / some email flows
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // Recovery / implicit hash flows
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }
      } catch (e) {
        if (!mounted) return;
        nav('/login', {
          replace: true,
          state: { authError: e?.message || 'Could not complete sign-in.' },
        });
        return;
      }

      // Give Supabase a moment to persist session
      for (let i = 0; i < 20; i++) {
        const { data } = await supabase.auth.getSession();
        if (data?.session) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      // Password recovery flow → send user to reset page
      if (type === 'recovery' && data?.session) {
        nav('/reset-password', { replace: true });
        return;
      }

      // Email confirmation flow → send back to login with success message
      if (type === 'signup') {
        nav('/login', {
          replace: true,
          state: { authNotice: 'Email confirmed. You can now sign in.' },
        });
        return;
      }

      // Normal signed-in success
      if (data?.session) {
        const next = getSafeRedirect(localStorage.getItem('oauthNext'));
        localStorage.removeItem('oauthNext');
        nav(next, { replace: true });
        return;
      }

      nav('/login?mode=signin', { replace: true });
    }

    handleAuthCallback();

    return () => {
      mounted = false;
    };
  }, [nav]);

  return (
    <PageLayout title="Connecting…">
      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <p aria-live="polite">Finishing sign-in…</p>
      </div>
    </PageLayout>
  );
}
