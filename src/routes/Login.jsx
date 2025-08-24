import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const nav = useNavigate();

  // 'signin' | 'signup'
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);

  // If already signed in, go to /projects. Also react to future logins.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav('/projects');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) nav('/projects');
    });
    return () => subscription.unsubscribe();
  }, [nav]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange will navigate on success
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // After clicking the confirmation email, user will be sent here.
            emailRedirectTo: `${window.location.origin}/projects`,
          },
        });
        if (error) throw error;

        if (!data.session) {
          // Most likely because "Confirm email" is ON in Supabase
          setNotice(
            'Account created. Please check your email to confirm before logging in.'
          );
        } else {
          setNotice('Account created and signed in.');
        }
      }
    } catch (e) {
      setErr(e?.message || 'Authentication error');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    setErr(null);
    setNotice(null);
    try {
      if (!email) {
        setErr('Enter your email above, then click Resend.');
        return;
      }
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/projects` },
      });
      if (error) throw error;
      setNotice('Confirmation email resent. Please check your inbox.');
    } catch (e) {
      setErr(e?.message || 'Could not resend confirmation.');
    }
  }

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <h2>{mode === 'signin' ? 'Log in' : 'Create account'}</h2>

      <form onSubmit={handleSubmit} className="card">
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

        <label htmlFor="pw" style={{ marginTop: 8 }}>Password</label>
        <input
          id="pw"
          className="input"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />

        {err && <p style={{ color: 'crimson', marginTop: 8 }}>{err}</p>}
        {notice && <p style={{ color: 'seagreen', marginTop: 8 }}>{notice}</p>}

        {mode === 'signup' && (
          <button
            type="button"
            className="button ghost"
            onClick={resendConfirmation}
            style={{ marginTop: 8 }}
          >
            Resend confirmation email
          </button>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Sign up'}
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(null); setNotice(null); }}
          >
            {mode === 'signin' ? 'Create account' : 'Have an account? Log in'}
          </button>
        </div>

        <small style={{ display: 'block', marginTop: 8, color: '#666' }}>
          Supabase → Authentication → URL Configuration → Site URL should be {window.location.origin}.
        </small>
      </form>
    </div>
  );
}
