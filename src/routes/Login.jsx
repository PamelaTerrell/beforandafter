// src/routes/Login.jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

export default function Login() {
  const nav = useNavigate();
  const { search } = useLocation();
  const qs = useMemo(() => new URLSearchParams(search), [search]);

  // Support /login?next=/p/123 and /login?mode=signup
  const nextPath = qs.get('next') || '/projects';
  const qsMode = qs.get('mode');
  const [mode, setMode] = useState(qsMode === 'signup' ? 'signup' : 'signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);

  /* ---------------- Helpers ---------------- */

  function normalizeEmail(v) {
    return v.trim().toLowerCase();
  }

  function friendlyError(message) {
    if (!message) return 'Authentication error';
    const m = message.toLowerCase();
    if (m.includes('email not confirmed')) return 'Please confirm your email before signing in.';
    if (m.includes('user already registered') || m.includes('user already exists')) {
      return 'An account with this email already exists. Try logging in instead.';
    }
    if (m.includes('invalid login')) return 'Invalid email or password.';
    if (m.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
    if (m.includes('expired') || m.includes('invalid or expired')) return 'That link expired. Try again.';
    return message;
  }

  function classifyAuthError(message = '') {
    const m = message.toLowerCase();
    if (m.includes('already registered') || m.includes('already exists')) return 'already_registered';
    if (m.includes('email not confirmed')) return 'email_not_confirmed';
    if (m.includes('invalid login')) return 'invalid_login';
    return 'generic';
  }

  async function sendPasswordReset(targetEmail) {
    const eNorm = normalizeEmail(targetEmail || email);
    if (!eNorm) throw new Error('Enter your email above first.');
    const { error } = await supabase.auth.resetPasswordForEmail(eNorm, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) throw error;
  }

  /* ---------------- Effects ---------------- */

  // If we were redirected from /auth/callback, surface a message and clear the query.
  useEffect(() => {
    const confirmed = qs.get('confirmed');
    const errorMsg = qs.get('error');
    if (confirmed) {
      setMode('signin');
      setNotice('Email confirmed — please sign in.');
      nav('/login', { replace: true }); // strip query params
    } else if (errorMsg) {
      setErr(decodeURIComponent(errorMsg));
      nav('/login', { replace: true });
    }
  }, [qs, nav]);

  // If already signed in, go to nextPath. Also react to future logins.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) nav(nextPath, { replace: true });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) nav(nextPath, { replace: true });
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [nav, nextPath]);

  /* ---------------- Handlers ---------------- */

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setNotice(null);
    const eNorm = normalizeEmail(email);

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: eNorm, password });
        if (error) throw error;
        // onAuthStateChange will navigate
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: eNorm,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });

        if (error) {
          const kind = classifyAuthError(error.message);
          if (kind === 'already_registered') {
            setMode('signin');
            setNotice('Looks like this email already has an account. Please sign in below.');
            return; // stop here; user will sign in or use helpers
          }
          throw error;
        }

        if (!data.session) {
          setNotice('Account created. Please check your email to confirm before logging in.');
        } else {
          setNotice('Account created and signed in.');
        }
      }
    } catch (e) {
      setErr(friendlyError(e?.message));
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    setErr(null);
    setNotice(null);
    try {
      const eNorm = normalizeEmail(email);
      if (!eNorm) {
        setErr('Enter your email above, then click Resend.');
        return;
      }
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: eNorm,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setNotice('Confirmation email resent. Please check your inbox.');
    } catch (e) {
      setErr(friendlyError(e?.message));
    }
  }

  // Google OAuth sign-in — always show account picker
  async function loginWithGoogle() {
    try {
      setLoading(true);
      setErr(null);
      setNotice(null);

      // Stash intended destination so AuthCallback can route correctly
      localStorage.setItem('oauthNext', nextPath);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: 'select_account' // always show the account chooser
            // If you also want to re-consent each time: 'consent select_account'
          },
        },
      });

      if (error) throw error;
      // Redirects to Google; flow continues on /auth/callback
    } catch (e) {
      setErr(friendlyError(e?.message));
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- UI ---------------- */

  const canSubmit = email.trim() && password.length >= 6 && !loading;
  const showContextPanel =
    (notice && notice.toLowerCase().includes('already has an account')) ||
    (err && err.toLowerCase().includes('confirm your email'));

  return (
    <PageLayout title={mode === 'signin' ? 'Log in' : 'Create account'}>
      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* --- OAuth block --- */}
        <button
          type="button"
          className="button"
          onClick={loginWithGoogle}
          disabled={loading}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          aria-label="Continue with Google"
        >
          {/* Simple inline Google 'G' */}
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37 16.3 37 10 30.7 10 23S16.3 9 24 9c3.7 0 7.1 1.3 9.7 3.8l6-6C35.8 3.5 30.3 1 24 1 11.8 1 2 10.8 2 23s9.8 22 22 22c12.7 0 21-8.9 21-21 0-1.4-.1-2.3-.5-4z" />
          </svg>
          Continue with Google
        </button>

        <div style={{ textAlign: 'center', margin: '12px 0', color: '#888' }}>
          <small>or use email</small>
        </div>

        {/* --- Email/password form --- */}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="pw" style={{ marginTop: 8 }}>Password</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            id="pw"
            className="input"
            type={showPw ? 'text' : 'password'}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="button ghost"
            aria-pressed={showPw}
            onClick={() => setShowPw(s => !s)}
            title={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>

        {err && <p style={{ color: 'crimson', marginTop: 8 }} aria-live="polite">{err}</p>}
        {notice && <p style={{ color: 'seagreen', marginTop: 8 }} aria-live="polite">{notice}</p>}

        {/* Contextual help actions (only when relevant) */}
        {showContextPanel && (
          <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button"
              onClick={() => setMode('signin')}
              title="Go to sign in"
            >
              Go to sign in
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={async () => {
                try {
                  await sendPasswordReset(email);
                  setNotice('Password reset email sent. Check your inbox.');
                  setErr(null);
                } catch (e) {
                  setErr(friendlyError(e.message));
                }
              }}
            >
              Forgot password?
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={resendConfirmation}
              title="Resend confirmation"
            >
              Resend confirmation
            </button>
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="button primary" type="submit" disabled={!canSubmit}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Sign up'}
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              const nextMode = mode === 'signin' ? 'signup' : 'signin';
              setMode(nextMode);
              setErr(null);
              setNotice(null);
              // keep mode reflected in URL for deep-linking
              const url = new URL(window.location.href);
              url.searchParams.set('mode', nextMode);
              window.history.replaceState({}, '', url.toString());
            }}
          >
            {mode === 'signin' ? 'Create account' : 'Have an account? Log in'}
          </button>
        </div>

        <small style={{ display: 'block', marginTop: 10, color: '#666' }}>
          Tip: If you don’t see the confirmation, check Spam/Promotions.
        </small>
      </form>
    </PageLayout>
  );
}
