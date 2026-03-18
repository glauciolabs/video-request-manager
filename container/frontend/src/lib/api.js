import { getLocalToken } from '@/lib/auth';

function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL || '';

  if (typeof window === 'undefined') {
    return configured || 'http://localhost:8080';
  }

  const { hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return configured || 'http://localhost:8080';
  }

  return `${origin}/api`;
}

// Basic API helper: adds JWT to gateway requests.
export async function apiFetch(path, options = {}) {
  const token = getLocalToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const error = new Error(payload?.message || `API error ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return response.json();
}
