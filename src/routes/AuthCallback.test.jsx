// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthCallback from './AuthCallback';
import { supabase } from '../lib/supabase';
import {
  captureAuthCallbackParameters,
  clearCapturedAuthCallbackParameters,
} from '../lib/authRouting';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      setSession: vi.fn(),
    },
  },
}));

function Destination() {
  const location = useLocation();
  return (
    <div>
      Destination: {location.pathname}
      {location.state?.authNotice ? ` (${location.state.authNotice})` : ''}
      {location.state?.authError ? ` (${location.state.authError})` : ''}
    </div>
  );
}

function capture({ search = '', hash = '' }) {
  captureAuthCallbackParameters(
    { pathname: '/auth/callback', search, hash },
    { state: null, replaceState: vi.fn() }
  );
}

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/projects" element={<Destination />} />
        <Route path="/community" element={<Destination />} />
        <Route path="/reset-password" element={<Destination />} />
        <Route path="/login" element={<Destination />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    supabase.auth.setSession.mockResolvedValue({ error: null });
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  afterEach(() => {
    clearCapturedAuthCallbackParameters();
  });

  it('exchanges an OAuth or magic-link PKCE code and keeps a safe internal destination', async () => {
    capture({ search: '?code=example-code' });
    localStorage.setItem('oauthNext', '/community');

    renderCallback();

    expect(await screen.findByText('Destination: /community')).not.toBeNull();
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('example-code');
    expect(localStorage.getItem('oauthNext')).toBeNull();
  });

  it('rejects an unsafe stored OAuth destination after a successful callback', async () => {
    capture({ search: '?code=example-code' });
    localStorage.setItem('oauthNext', '//attacker.example');

    renderCallback();

    expect(await screen.findByText('Destination: /projects')).not.toBeNull();
  });

  it('restores an implicit magic-link session without exposing extra hash parameters', async () => {
    capture({
      hash: '#access_token=example-access&refresh_token=example-refresh&type=magiclink&extra=ignored',
    });

    renderCallback();

    expect(await screen.findByText('Destination: /projects')).not.toBeNull();
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'example-access',
      refresh_token: 'example-refresh',
    });
  });

  it('routes a password-recovery code to the reset form', async () => {
    capture({ search: '?type=recovery&code=example-recovery-code' });

    renderCallback();

    expect(await screen.findByText('Destination: /reset-password')).not.toBeNull();
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      'example-recovery-code'
    );
  });

  it('routes email confirmation to login without placing its notice in the URL', async () => {
    capture({
      hash: '#access_token=example-access&refresh_token=example-refresh&type=signup',
    });

    renderCallback();

    expect(
      await screen.findByText(
        'Destination: /login (Email confirmed. You can now sign in.)'
      )
    ).not.toBeNull();
  });

  it('does not display an untrusted callback error description', async () => {
    capture({ search: '?error_description=Click%20this%20untrusted%20link' });

    renderCallback();

    expect(await screen.findByText(/Destination: \/login \(We could not complete sign-in/)).not.toBeNull();
    expect(screen.queryByText(/Click this untrusted link/)).toBeNull();
  });
});
