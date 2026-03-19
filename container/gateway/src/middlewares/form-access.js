import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getRequesterIp, verifyTurnstileToken } from '../lib/turnstile.js';

const FORM_ENTRY_ENABLED = String(process.env.FORM_ENTRY_ENABLED || 'false').toLowerCase() === 'true';
const FORM_ENTRY_PASSWORD = String(process.env.FORM_ENTRY_PASSWORD || '');
const FORM_ACCESS_TOKEN_TTL = String(process.env.FORM_ACCESS_TOKEN_TTL || '2h');
const FORM_ACCESS_JWT_SECRET = String(
  process.env.FORM_ACCESS_JWT_SECRET
  || process.env.JWT_SECRET
  || process.env.SERVICE_JWT_SECRET
  || ''
);
const FORM_ACCESS_MAX_ATTEMPTS = Math.max(1, Number(process.env.FORM_ACCESS_MAX_ATTEMPTS || 5));
const FORM_ACCESS_BLOCK_MINUTES = Math.max(1, Number(process.env.FORM_ACCESS_BLOCK_MINUTES || 15));

const accessSchema = z.object({
  password: z.string().min(1).max(256),
  turnstileToken: z.string().trim().max(4096).optional().default('')
});

const failedAttemptsByIp = new Map();

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readBearerToken(headerValue) {
  const value = String(headerValue || '').trim();
  if (!value.toLowerCase().startsWith('bearer ')) return '';
  return value.slice(7).trim();
}

function getState(ip) {
  const current = failedAttemptsByIp.get(ip);
  if (!current) return { count: 0, blockedUntil: 0 };
  return current;
}

function isBlocked(ip, nowMs = Date.now()) {
  const state = getState(ip);
  return state.blockedUntil > nowMs ? state : null;
}

function registerFailure(ip, nowMs = Date.now()) {
  const state = getState(ip);
  const nextCount = state.count + 1;
  const blockMs = FORM_ACCESS_BLOCK_MINUTES * 60 * 1000;
  const blockedUntil = nextCount >= FORM_ACCESS_MAX_ATTEMPTS ? nowMs + blockMs : 0;
  const nextState = {
    count: blockedUntil ? 0 : nextCount,
    blockedUntil
  };
  failedAttemptsByIp.set(ip, nextState);
  return nextState;
}

function clearFailures(ip) {
  failedAttemptsByIp.delete(ip);
}

function getTokenFromRequest(req) {
  return (
    readBearerToken(req.headers.authorization)
    || String(req.headers['x-form-access-token'] || '').trim()
  );
}

function isConfigured() {
  return FORM_ACCESS_ENABLED_DISABLED_BYPASS || (FORM_ACCESS_JWT_SECRET && FORM_ENTRY_PASSWORD);
}

const FORM_ACCESS_ENABLED_DISABLED_BYPASS = !FORM_ENTRY_ENABLED;

function getExpiresAt(token) {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== 'object') return null;
  if (!decoded.exp) return null;
  return new Date(decoded.exp * 1000).toISOString();
}

export function enforceFormIntakeAccess(req, res, next) {
  if (FORM_ACCESS_ENABLED_DISABLED_BYPASS) return next();
  if (!isConfigured()) {
    return res.status(503).json({ error: 'form_access_misconfigured' });
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'form_access_required' });
  }

  try {
    const payload = jwt.verify(token, FORM_ACCESS_JWT_SECRET);
    if (!payload || payload.scope !== 'form_intake_access') {
      return res.status(401).json({ error: 'form_access_invalid' });
    }

    const requesterIp = getRequesterIp(req);
    const tokenIp = String(payload.ip || '');
    if (tokenIp && tokenIp !== 'unknown' && requesterIp && requesterIp !== tokenIp) {
      return res.status(401).json({ error: 'form_access_ip_mismatch' });
    }

    req.formAccess = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'form_access_invalid' });
  }
}

export async function issueFormAccessToken(req, res) {
  if (FORM_ACCESS_ENABLED_DISABLED_BYPASS) {
    return res.json({ ok: true, disabled: true });
  }

  if (!isConfigured()) {
    return res.status(503).json({ error: 'form_access_misconfigured' });
  }

  const parsed = accessSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_request',
      details: parsed.error.flatten()
    });
  }

  const requesterIp = getRequesterIp(req) || 'unknown';
  const nowMs = Date.now();
  const blocked = isBlocked(requesterIp, nowMs);
  if (blocked) {
    const retryAfterSeconds = Math.max(1, Math.ceil((blocked.blockedUntil - nowMs) / 1000));
    return res.status(429).json({
      error: 'form_access_temporarily_blocked',
      retryAfterSeconds
    });
  }

  const turnstile = await verifyTurnstileToken({
    token: parsed.data.turnstileToken,
    req
  });
  if (!turnstile.ok) {
    return res.status(400).json({
      error: 'turnstile_verification_failed',
      reason: turnstile.reason || 'unknown'
    });
  }

  if (!safeCompare(parsed.data.password, FORM_ENTRY_PASSWORD)) {
    const updated = registerFailure(requesterIp, nowMs);
    const retryAfterSeconds = updated.blockedUntil
      ? Math.max(1, Math.ceil((updated.blockedUntil - nowMs) / 1000))
      : 0;
    return res.status(401).json({
      error: 'form_access_invalid_password',
      retryAfterSeconds
    });
  }

  clearFailures(requesterIp);
  const token = jwt.sign(
    {
      scope: 'form_intake_access',
      ip: requesterIp
    },
    FORM_ACCESS_JWT_SECRET,
    {
      expiresIn: FORM_ACCESS_TOKEN_TTL
    }
  );

  return res.json({
    token,
    expiresAt: getExpiresAt(token)
  });
}
