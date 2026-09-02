export const DEFAULT_POST_AUTH_PATH = '/projects';
export const SAFE_AUTH_ERROR_MESSAGE =
  'We could not complete sign-in. Please try again or request a new link.';

const AUTH_PARAMETER_NAMES = new Set([
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'id_token',
  'token',
  'token_hash',
  'code',
  'state',
  'error',
  'error_code',
  'error_description',
]);

let capturedAuthCallbackParameters = null;

function decodeRepeatedly(value) {
  let decoded = value;

  for (let i = 0; i < 3; i += 1) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) break;
    decoded = next;
  }

  return decoded;
}

function containsSensitiveParameters(value = '') {
  const params = new URLSearchParams(value.replace(/^[?#]/, ''));
  return [...params.keys()].some((key) => AUTH_PARAMETER_NAMES.has(key.toLowerCase()));
}

function containsControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export function isSensitiveAuthPath(pathname = '') {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return (
    normalized === '/login' ||
    normalized === '/reset-password' ||
    normalized === '/auth' ||
    normalized.startsWith('/auth/')
  );
}

export function isAnalyticsSafeLocation({ pathname = '', search = '', hash = '' }) {
  return (
    !isSensitiveAuthPath(pathname) &&
    !containsSensitiveParameters(search) &&
    !containsSensitiveParameters(hash)
  );
}

export function getSafeRedirect(value, fallback = DEFAULT_POST_AUTH_PATH) {
  if (typeof value !== 'string' || value.length === 0) return fallback;

  let candidate;
  try {
    candidate = decodeRepeatedly(value.trim());
  } catch {
    return fallback;
  }

  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    containsControlCharacters(candidate)
  ) {
    return fallback;
  }

  let parsed;
  try {
    parsed = new URL(candidate, 'https://internal.invalid');
  } catch {
    return fallback;
  }

  if (
    parsed.origin !== 'https://internal.invalid' ||
    isSensitiveAuthPath(parsed.pathname) ||
    containsSensitiveParameters(parsed.search) ||
    containsSensitiveParameters(parsed.hash)
  ) {
    return fallback;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function captureAuthCallbackParameters(
  locationObject = window.location,
  historyObject = window.history
) {
  if (locationObject.pathname.toLowerCase().replace(/\/+$/, '') !== '/auth/callback') {
    return null;
  }

  const query = new URLSearchParams(locationObject.search);
  const hash = new URLSearchParams(locationObject.hash.replace(/^#/, ''));

  capturedAuthCallbackParameters = Object.freeze({
    code: query.get('code'),
    type: query.get('type') || hash.get('type'),
    accessToken: hash.get('access_token'),
    refreshToken: hash.get('refresh_token'),
    error:
      query.get('error_description') ||
      query.get('error') ||
      hash.get('error_description') ||
      hash.get('error'),
  });

  // Credentials must be removed before React or any optional analytics component mounts.
  historyObject.replaceState(historyObject.state, '', locationObject.pathname);
  return capturedAuthCallbackParameters;
}

export function getCapturedAuthCallbackParameters() {
  return capturedAuthCallbackParameters;
}

export function clearCapturedAuthCallbackParameters() {
  capturedAuthCallbackParameters = null;
}
