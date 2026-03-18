import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { logger } from '../lib/logger.js';

const AUTH_MODE = (process.env.AUTH_MODE || 'none').toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET || '';
const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID
  || process.env.NEXT_PUBLIC_ENTRA_TENANT_ID
  || process.env.NEXT_PUBLIC_AZURE_TENANT_ID
  || '';
const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID
  || process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID
  || process.env.NEXT_PUBLIC_AZURE_CLIENT_ID
  || '';
const ENTRA_AUDIENCE = process.env.ENTRA_AUDIENCE || '';
const ENTRA_SCOPE = process.env.ENTRA_SCOPE
  || process.env.NEXT_PUBLIC_ENTRA_SCOPE
  || process.env.NEXT_PUBLIC_AZURE_SCOPE
  || '';
const ENTRA_ALLOW_ANY_AUDIENCE = String(
  process.env.ENTRA_ALLOW_ANY_AUDIENCE || (ENTRA_AUDIENCE ? 'false' : 'true')
).toLowerCase() === 'true';
const ENTRA_ADMIN_ROLE = process.env.ENTRA_ADMIN_ROLE || '';

const allowedModes = new Set(['none', 'local', 'entra']);
const entraConfigured = Boolean(ENTRA_TENANT_ID && ENTRA_CLIENT_ID);
const effectiveMode = allowedModes.has(AUTH_MODE)
  ? (AUTH_MODE === 'none' && entraConfigured ? 'entra' : AUTH_MODE)
  : (entraConfigured ? 'entra' : 'none');

const entraIssuer = ENTRA_TENANT_ID ? `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0` : '';
const entraIssuers = ENTRA_TENANT_ID
  ? [entraIssuer, `${entraIssuer}/`, `https://sts.windows.net/${ENTRA_TENANT_ID}/`]
  : [];
const entraJwks = ENTRA_TENANT_ID
  ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${ENTRA_TENANT_ID}/discovery/v2.0/keys`))
  : null;

function parseScopeAudience(scopeValue) {
  const scope = String(scopeValue || '').trim();
  if (!scope) return '';

  if (scope.startsWith('api://')) {
    const slashPos = scope.indexOf('/', 6);
    return slashPos > 0 ? scope.slice(0, slashPos) : scope;
  }

  const slashPos = scope.indexOf('/');
  if (slashPos > 0) {
    const prefix = scope.slice(0, slashPos);
    if (/^[0-9a-fA-F-]{36}$/.test(prefix)) return prefix;
  }

  return '';
}

function getAllowedEntraAudiences() {
  const values = new Set();

  if (ENTRA_AUDIENCE) {
    ENTRA_AUDIENCE
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => values.add(value));
  }

  const scopeAudience = parseScopeAudience(ENTRA_SCOPE);
  if (scopeAudience) values.add(scopeAudience);

  if (ENTRA_CLIENT_ID) {
    values.add(ENTRA_CLIENT_ID);
    values.add(`api://${ENTRA_CLIENT_ID}`);
  }

  return Array.from(values);
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return '';
  return auth.slice('Bearer '.length).trim();
}

function hasAdminRole(payload, mode) {
  if (!payload) return false;
  if (payload.role === 'admin') return true;
  if (mode === 'entra' && !ENTRA_ADMIN_ROLE) return true;
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
    if (!JWT_SECRET) {
      return res.status(500).json({ error: 'local_auth_not_configured' });
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (!hasAdminRole(payload, 'local')) return res.status(403).json({ error: 'forbidden' });
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
    const audience = getAllowedEntraAudiences();
    const verifyOptions = { issuer: entraIssuers };
    if (audience.length > 0 && !ENTRA_ALLOW_ANY_AUDIENCE) {
      verifyOptions.audience = audience;
    }
    const { payload } = await jwtVerify(token, entraJwks, verifyOptions);

    if (!hasAdminRole(payload, 'entra')) return res.status(403).json({ error: 'forbidden' });
    req.user = payload;
    return next();
  } catch (err) {
    const unverified = decodeJwtPayload(token) || {};
    logger.warn({
      reason: err?.code || err?.name || 'entra_verify_failed',
      message: err?.message || '',
      tokenIss: unverified.iss || '',
      tokenAud: unverified.aud || '',
      tokenAzp: unverified.azp || '',
      tokenAppId: unverified.appid || '',
      tokenScope: unverified.scp || '',
      expectedIssuers: entraIssuers,
      expectedAudiences: getAllowedEntraAudiences(),
      allowAnyAudience: ENTRA_ALLOW_ANY_AUDIENCE
    }, 'invalid Entra token for admin endpoint');
    return res.status(401).json({ error: 'invalid_entra_token' });
  }
}
