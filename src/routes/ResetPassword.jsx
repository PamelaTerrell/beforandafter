import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

export default function ResetPassword() {
  const nav = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      const { data } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!data?.session) {
        nav('/login', {
          replace: true,
          state: { authError: 'Your password reset link is invalid or has expired.' },
        });
        return;
      }

      setCheckingSession(false);
    }

    checkRecoverySession();

    return () => {
      mounted = false;
    };
  }, [nav]);

  function validatePassword(value) {
    if (value.length < 6) {
      return 'Password must be at least 6 characters.';
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setNotice(null);

    const pwError = validatePassword(password);
    if (pwError) {
      setErr(pwError);
      return;
    }

    if (password !== confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      setNotice('Password updated. Redirecting you…');

      setTimeout(() => {
        nav('/projects', { replace: true });
      }, 1200);
    } catch (e) {
      setErr(e?.message || 'Could not update password.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <PageLayout title="Reset password" noIndex>
        <div className="card auth-card">
          <p aria-live="polite">Checking your reset link…</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Reset password" noIndex>
      <form onSubmit={handleSubmit} className="card auth-card" aria-busy={loading}>
        <p style={{ marginTop: 0 }}>
          Enter your new password below.
        </p>

        <label htmlFor="new-password">New password</label>
        <div className="password-field">
          <input
            id="new-password"
            className="input"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button
            type="button"
            className="button ghost"
            aria-controls="new-password"
            aria-pressed={showPw}
            onClick={() => setShowPw((s) => !s)}
          >
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>

        <label htmlFor="confirm-password" style={{ marginTop: 8 }}>
          Confirm new password
        </label>
        <input
          id="confirm-password"
          className="input"
          type={showPw ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
        />

        {err && (
          <p style={{ color: 'crimson', marginTop: 8 }} aria-live="polite">
            {err}
          </p>
        )}

        {notice && (
          <p style={{ color: 'seagreen', marginTop: 8 }} aria-live="polite">
            {notice}
          </p>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="submit"
            className="button primary"
            disabled={loading || password.length < 6 || confirmPassword.length < 6}
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </PageLayout>
  );
}
