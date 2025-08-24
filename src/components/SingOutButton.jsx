import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function SignOutButton({ className = 'button ghost' }) {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      alert(error.message || 'Sign-out failed');
      return;
    }
    nav('/login');            // or: window.location.href = '/login'
  }

  return (
    <button className={className} onClick={handleSignOut} disabled={loading}>
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
