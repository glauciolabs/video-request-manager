import { clearAdminToken, getAdminToken, getAuthMode, saveAdminToken } from '@/lib/auth';
import { bootstrapEntraSession } from '@/lib/entra';
import { getRuntimeConfig } from '@/lib/runtime-config';

export function getApiBaseUrl() {
  const configured = getRuntimeConfig().apiBaseUrl || '';

  if (typeof window === 'undefined') {
    return configured || 'http://localhost:8080';
  }

  const { hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return configured || 'http://localhost:8080';
  }

  return `${origin}/api`;
}

export async function fetchJson(path, options = {}) {
  let token = getAdminToken();
  if (getAuthMode() === 'entra') {
    token = await bootstrapEntraSession();
    if (token) {
      saveAdminToken(token);
    }
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (payload?.error === 'invalid_entra_token' && getAuthMode() === 'entra') {
      clearAdminToken();
      if (typeof window !== 'undefined') {
        window.location.assign('/login');
      }
    }
    const error = new Error(payload?.error || `API ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return response.json();
}
