// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Guard from './Guard';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

function renderProtected(child) {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/protected" element={<Guard>{child}</Guard>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('never mounts protected children for an unauthenticated visitor', async () => {
    let resolveSession;
    const sessionPromise = new Promise((resolve) => {
      resolveSession = resolve;
    });
    const privateRequest = vi.fn();

    function ProtectedChild() {
      useEffect(() => {
        privateRequest();
      }, []);
      return <div>Private content</div>;
    }

    supabase.auth.getSession.mockReturnValue(sessionPromise);
    renderProtected(<ProtectedChild />);

    expect(screen.queryByText('Private content')).toBeNull();
    expect(privateRequest).not.toHaveBeenCalled();

    await act(async () => {
      resolveSession({ data: { session: null }, error: null });
      await sessionPromise;
    });

    expect(await screen.findByText('Login page')).not.toBeNull();
    expect(screen.queryByText('Private content')).toBeNull();
    expect(privateRequest).not.toHaveBeenCalled();
  });

  it('mounts protected children only after a session is confirmed', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });

    renderProtected(<div>Private content</div>);

    expect(screen.queryByText('Private content')).toBeNull();
    expect(await screen.findByText('Private content')).not.toBeNull();
  });
});
