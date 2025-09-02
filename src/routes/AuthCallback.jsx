import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      // Handles email confirm / magic link (PKCE code exchange)
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);

      if (error) {
        console.error('[auth/callback] ', error);
        navigate(`/login?error=${encodeURIComponent(error.message)}`);
      } else {
        // choose where to land them — login (to sign in) or straight into the app
        navigate('/login?confirmed=1'); // or navigate('/projects')
      }
    })();
  }, [navigate]);

  return <p style={{ padding: 16 }}>Finishing sign-in…</p>;
}
