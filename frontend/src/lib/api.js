import { getLocalToken } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

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

  const response = await fetch(`${API_BASE_URL}${path}`, {
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
