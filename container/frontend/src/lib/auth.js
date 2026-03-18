const AUTH_STORAGE_KEY = 'vrm_auth_session';

export function saveLocalToken(token) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(AUTH_STORAGE_KEY, token);
  }
}

export function getLocalToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  }
  return null;
}

export function clearLocalToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}
