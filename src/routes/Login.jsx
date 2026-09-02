// src/routes/Login.jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';
import { getSafeRedirect } from '../lib/authRouting';

export default function Login() {
  const nav = useNavigate();
  const { search, state } = useLocation();
  const qs = useMemo(() => new URLSearchParams(search), [search]);

  const nextPath = getSafeRedirect(qs.get('next'));
  const qsMode = qs.get('mode');
  const [mode, setMode] = useState(qsMode === 'signup' ? 'signup' : 'signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);

  const [inApp, setInApp] = useState(false);

  /* ---------------- Helpers ---------------- */

  function normalizeEmail(v) {
    return v.trim().toLowerCase();
  }

  function friendlyError(message) {
    if (!message) return 'Authentication error';
    const m = message.toLowerCase();

    if (m.includes('invalid login')) return 'Invalid email or password.';
    if (m.includes('already exists')) return 'An account with this email already exists.';
    if (m.includes('rate limit')) return 'Too many attempts. Please wait and try again.';
    return message;
  }

  async function sendPasswordReset(targetEmail) {
    const eNorm = normalizeEmail(targetEmail || email);
    if (!eNorm) throw new Error('Enter your email above first.');

    const { error } = await supabase.auth.resetPasswordForEmail(eNorm, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    if (error) throw error;
  }

  /* ---------------- Effects ---------------- */

  useEffect(() => {
    const errorMsg = state?.authError || qs.get('error');
    const successMsg = state?.authNotice;

    if (errorMsg) {
      setErr(errorMsg);
      nav('/login', { replace: true, state: null });
    } else if (successMsg) {
      setNotice(successMsg);
      nav('/login', { replace: true, state: null });
    }
  }, [qs, nav, state]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) nav(nextPath, { replace: true });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) nav(nextPath, { replace: true });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [nav, nextPath]);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isInApp =
      /(fbav|instagram|linkedinapp|tiktok|snapchat|micromessenger)/i.test(ua);
    setInApp(isInApp);
  }, []);

  /* ---------------- Handlers ---------------- */

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setNotice(null);

    const eNorm = normalizeEmail(email);

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: eNorm,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: eNorm,
          password,
        });

        if (error) throw error;

        setNotice('Account created. You are now signed in.');
      }
    } catch (e) {
      setErr(friendlyError(e.message));
    } finally {
      setLoading(false);
    }
  }

  async function loginWithMagicLink() {
    try {
      setLoading(true);
      setErr(null);
      setNotice(null);

      const eNorm = normalizeEmail(email);
      if (!eNorm) {
        setErr('Enter your email above.');
        return;
      }

      localStorage.setItem('oauthNext', nextPath);

      const { error } = await supabase.auth.signInWithOtp({
        email: eNorm,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) throw error;

      setNotice('Magic link sent. Check your email.');
    } catch (e) {
      setErr(friendlyError(e.message));
    } finally {
      setLoading(false);
    }
  }

  async function loginWithGoogle() {
    try {
      setLoading(true);
      setErr(null);
      setNotice(null);

      localStorage.setItem('oauthNext', nextPath);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (e) {
      setErr(friendlyError(e.message));
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- UI ---------------- */

  const canSubmit = email && password.length >= 6 && !loading;

  return (
    <PageLayout title={mode === 'signin' ? 'Log in' : 'Create account'}>
      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 520, margin: '0 auto' }}>

        <button
          type="button"
          className="button"
          onClick={loginWithGoogle}
          disabled={loading}
          style={{ width: '100%' }}
        >
          Continue with Google
        </button>

        {inApp && (
          <button
            type="button"
            className="button ghost"
            onClick={loginWithMagicLink}
            disabled={loading}
            style={{ width: '100%', marginTop: 8 }}
          >
            Email me a sign-in link
          </button>
        )}

        <div style={{ textAlign: 'center', margin: '12px 0', color: '#888' }}>
          <small>or use email</small>
        </div>

        <label>Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label style={{ marginTop: 8 }}>Password</label>
        <div className="row">
          <input
            className="input"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ flex: 1 }}
          />
          <button type="button" onClick={() => setShowPw(s => !s)}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>

        {err && <p style={{ color: 'crimson' }}>{err}</p>}
        {notice && <p style={{ color: 'seagreen' }}>{notice}</p>}

        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              try {
                await sendPasswordReset(email);
                setNotice('Password reset email sent.');
              } catch (e) {
                setErr(friendlyError(e.message));
              }
            }}
          >
            Forgot password?
          </button>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="button primary" disabled={!canSubmit}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Sign up'}
          </button>

          <button
            type="button"
            className="button ghost"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? 'Create account' : 'Have an account? Log in'}
          </button>
        </div>

      </form>
    </PageLayout>
  );
}
