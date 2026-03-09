import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_MODE = (process.env.AUTH_MODE || 'none').toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID || '';
const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID || '';
const ENTRA_ADMIN_ROLE = process.env.ENTRA_ADMIN_ROLE || '';

const allowedModes = new Set(['none', 'local', 'entra']);
const effectiveMode = allowedModes.has(AUTH_MODE) ? AUTH_MODE : 'none';

const entraIssuer = ENTRA_TENANT_ID
  ? `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0`
  : '';
const entraJwks = ENTRA_TENANT_ID
  ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${ENTRA_TENANT_ID}/discovery/v2.0/keys`))
  : null;

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return '';
  return auth.slice('Bearer '.length).trim();
}

function hasAdminRole(payload) {
  if (!payload) return false;
  if (payload.role === 'admin') return true;
  if (Array.isArray(payload.roles)) {
    if (!ENTRA_ADMIN_ROLE) return true;
    return payload.roles.includes(ENTRA_ADMIN_ROLE);
  }
  return false;
}

export async function enforceAdminAccess(req, res, next) {
  if (effectiveMode === 'none') return next();

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'missing_bearer_token' });

  if (effectiveMode === 'local') {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (!hasAdminRole(payload)) return res.status(403).json({ error: 'forbidden' });
      req.user = payload;
      return next();
    } catch {
      return res.status(401).json({ error: 'invalid_user_token' });
    }
  }

  // Microsoft Entra ID access token validation (bearer token from frontend).
  if (!entraJwks || !ENTRA_CLIENT_ID || !entraIssuer) {
    return res.status(500).json({ error: 'entra_auth_not_configured' });
  }

  try {
    const { payload } = await jwtVerify(token, entraJwks, {
      issuer: entraIssuer,
      audience: ENTRA_CLIENT_ID
    });

    if (!hasAdminRole(payload)) return res.status(403).json({ error: 'forbidden' });
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_entra_token' });
  }
}
