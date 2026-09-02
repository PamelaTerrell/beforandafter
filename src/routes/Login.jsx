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
    if (m.includes('email not confirmed')) return 'Please confirm your email before signing in.';
    if (m.includes('network') || m.includes('fetch')) return 'We could not reach the sign-in service. Please try again.';
    return 'We could not complete that request. Please try again.';
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
    const errorMsg = state?.authError;
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
        const { data, error } = await supabase.auth.signUp({
          email: eNorm,
          password,
        });

        if (error) throw error;

        setNotice(
          data.session
            ? 'Account created. Your private vault is ready.'
            : 'Account created. Check your email to confirm your address.'
        );
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

  async function requestPasswordReset() {
    try {
      setLoading(true);
      setErr(null);
      setNotice(null);
      await sendPasswordReset(email);
      setNotice('Password reset email sent.');
    } catch (e) {
      setErr(friendlyError(e.message));
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- UI ---------------- */

  const canSubmit = email && password.length >= 6 && !loading;

  return (
    <PageLayout title={mode === 'signin' ? 'Log in' : 'Create account'} noIndex>
      <form onSubmit={handleSubmit} className="card auth-card" aria-busy={loading}>
        <p className="auth-intro">
          {mode === 'signin'
            ? 'Welcome back. Sign in to continue to your private vault.'
            : 'Create your private vault. You choose what is ever shared publicly.'}
        </p>

        <button
          type="button"
          className="button"
          onClick={loginWithGoogle}
          disabled={loading}
          style={{ width: '100%' }}
        >
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>{mode === 'signin' ? 'or sign in with email' : 'or create an account with email'}</span>
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field-label-row">
          <label htmlFor="password">Password</label>
          {mode === 'signin' && (
            <button type="button" className="button linklike" onClick={requestPasswordReset} disabled={loading}>
              Forgot password?
            </button>
          )}
        </div>
        <div className="password-field">
          <input
            id="password"
            className="input"
            type={showPw ? 'text' : 'password'}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button className="button ghost" type="button" onClick={() => setShowPw(s => !s)} aria-controls="password" aria-pressed={showPw}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>

        {err && <p className="status-message error" role="alert">{err}</p>}
        {notice && <p className="status-message success" role="status">{notice}</p>}

        <button className="button primary auth-submit" disabled={!canSubmit}>
          {loading ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Create account'}
        </button>

        {mode === 'signin' && (
          <>
            <div className="auth-divider"><span>or use a passwordless link</span></div>
            <button type="button" className="button ghost" onClick={loginWithMagicLink} disabled={loading}>
              Email me a sign-in link
            </button>
            {inApp && <small>Sign-in links work especially well inside social media browsers.</small>}
          </>
        )}

        <div className="auth-switch">
          <span>{mode === 'signin' ? 'New to Before & After Vault?' : 'Already have an account?'}</span>
          <button
            type="button"
            className="button linklike"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? 'Create account' : 'Log in'}
          </button>
        </div>

      </form>
    </PageLayout>
  );
}
