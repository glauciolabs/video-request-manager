const TOKEN_KEY = 'vrm_admin_token';

export function getAuthMode() {
  return (process.env.NEXT_PUBLIC_AUTH_MODE || 'none').toLowerCase();
}

export function isAuthEnabled() {
  return getAuthMode() !== 'none';
}

export function saveAdminToken(token) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function getAdminToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return null;
}

export function clearAdminToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
  }
}
