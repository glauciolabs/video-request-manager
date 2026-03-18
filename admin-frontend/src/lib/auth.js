const AUTH_STORAGE_KEY = 'vrm_admin_session';
const USER_STORAGE_KEY = 'vrm_admin_user';
import { getRuntimeConfig } from '@/lib/runtime-config';

function getPublicEntraConfig() {
  const config = getRuntimeConfig();
  const tenantId = config.entraTenantId || '';
  const clientId = config.entraClientId || '';

  return {
    tenantId,
    clientId,
    enabled: Boolean(tenantId && clientId)
  };
}

export function getAuthMode() {
  const explicitMode = (getRuntimeConfig().authMode || 'none').toLowerCase();
  if (explicitMode === 'entra') return 'entra';
  if (explicitMode === 'local') return 'local';

  return getPublicEntraConfig().enabled ? 'entra' : 'none';
}

export function isAuthEnabled() {
  return getAuthMode() !== 'none';
}

export function saveAdminToken(token) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(AUTH_STORAGE_KEY, token);
    const parsedUser = parseUserFromToken(token);
    if (parsedUser) {
      saveAdminUser(parsedUser);
    }
  }
}

export function getAdminToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  }
  return null;
}

export function clearAdminToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

function parseJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const raw = parts[1];
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function parseUserFromToken(token) {
  const payload = parseJwtPayload(token);
  if (!payload) return null;

  const name = payload.name
    || [payload.given_name, payload.family_name].filter(Boolean).join(' ')
    || '';
  const email = payload.preferred_username
    || payload.email
    || payload.upn
    || payload.unique_name
    || '';
  const avatarUrl = payload.picture || payload.avatar || '';

  if (!name && !email) return null;

  return { name, email, avatarUrl };
}

export function saveAdminUser(user) {
  if (typeof window === 'undefined') return;
  if (!user || typeof user !== 'object') return;

  const normalized = {
    name: String(user.name || '').trim(),
    email: String(user.email || '').trim(),
    avatarUrl: String(user.avatarUrl || '').trim()
  };

  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalized));
}

export function getAdminUser() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      name: String(parsed.name || '').trim(),
      email: String(parsed.email || '').trim(),
      avatarUrl: String(parsed.avatarUrl || '').trim()
    };
  } catch {
    return null;
  }
}
