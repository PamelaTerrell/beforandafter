import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureAuthCallbackParameters,
  clearCapturedAuthCallbackParameters,
  getCapturedAuthCallbackParameters,
  getSafeRedirect,
  isAnalyticsSafeLocation,
} from './authRouting';

afterEach(() => {
  clearCapturedAuthCallbackParameters();
});

describe('getSafeRedirect', () => {
  it.each([
    ['/projects', '/projects'],
    ['/projects/123', '/projects/123'],
    ['/community?filter=recent#gallery', '/community?filter=recent#gallery'],
    ['%2Fprojects%2F123', '/projects/123'],
  ])('allows internal application destination %s', (value, expected) => {
    expect(getSafeRedirect(value)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'https://attacker.example',
    '//attacker.example/path',
    'javascript:alert(1)',
    '\\attacker.example',
    '/\\attacker.example',
    '%2F%2Fattacker.example',
    '%252F%252Fattacker.example',
    '/projects%5C@attacker.example',
    '/projects%0Aattacker.example',
    '/auth/callback',
    '/auth/callback?code=example',
    '/reset-password',
    '/login',
    '/projects?code=example',
    '/projects#access_token=example',
  ])('rejects unsafe destination %s', (value) => {
    expect(getSafeRedirect(value)).toBe('/projects');
  });
});

describe('authentication callback containment', () => {
  it('captures only required parameters and immediately clears the browser URL', () => {
    const replaceState = vi.fn();
    const location = {
      pathname: '/auth/callback',
      search: '?code=example-code&type=recovery&ignored=private-value',
      hash: '#access_token=example-access&refresh_token=example-refresh&extra=ignored',
    };
    const history = { state: { existing: true }, replaceState };

    const captured = captureAuthCallbackParameters(location, history);

    expect(captured).toEqual({
      code: 'example-code',
      type: 'recovery',
      accessToken: 'example-access',
      refreshToken: 'example-refresh',
      error: null,
    });
    expect(getCapturedAuthCallbackParameters()).toBe(captured);
    expect(replaceState).toHaveBeenCalledWith(history.state, '', '/auth/callback');
  });

  it.each([
    { pathname: '/auth/callback', search: '', hash: '' },
    { pathname: '/reset-password', search: '', hash: '' },
    { pathname: '/login', search: '', hash: '' },
    { pathname: '/projects', search: '?code=example', hash: '' },
    { pathname: '/projects', search: '', hash: '#refresh_token=example' },
  ])('blocks analytics for sensitive location $pathname$search$hash', (location) => {
    expect(isAnalyticsSafeLocation(location)).toBe(false);
  });

  it('allows analytics on an ordinary route without sending its query or fragment', () => {
    expect(
      isAnalyticsSafeLocation({
        pathname: '/community',
        search: '?filter=recent',
        hash: '#gallery',
      })
    ).toBe(true);
  });
});
