import { isIP } from 'node:net';

const TURNSTILE_ENABLED = String(process.env.TURNSTILE_ENABLED || 'false').toLowerCase() === 'true';
const TURNSTILE_SECRET_KEY = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
const TURNSTILE_VERIFY_URL = process.env.TURNSTILE_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = Number(process.env.TURNSTILE_TIMEOUT_MS || 8000);

function normalizeIpCandidate(value) {
  if (!value) return '';
  let candidate = String(value).trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
  if (!candidate || candidate.toLowerCase() === 'unknown') return '';

  if (candidate.startsWith('[') && candidate.includes(']')) {
    candidate = candidate.slice(1, candidate.indexOf(']'));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.split(':')[0];
  }

  if (candidate.includes('%')) {
    candidate = candidate.split('%')[0];
  }

  if (candidate.startsWith('::ffff:')) {
    const mapped = candidate.slice(7);
    if (isIP(mapped) === 4) return mapped;
  }

  return isIP(candidate) ? candidate : '';
}

export function getRequesterIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const forwardedValues = Array.isArray(forwarded)
    ? forwarded.join(',')
    : String(forwarded || '');
  const firstForwarded = forwardedValues.split(',').map((entry) => entry.trim()).find(Boolean);

  return (
    normalizeIpCandidate(firstForwarded)
    || normalizeIpCandidate(req?.headers?.['x-real-ip'])
    || normalizeIpCandidate(req?.ip)
    || normalizeIpCandidate(req?.socket?.remoteAddress)
    || ''
  );
}

function mapTurnstileError(errorCodes = []) {
  if (!Array.isArray(errorCodes) || errorCodes.length === 0) {
    return 'turnstile_verification_failed';
  }

  if (errorCodes.includes('missing-input-response')) return 'turnstile_token_missing';
  if (errorCodes.includes('invalid-input-response')) return 'turnstile_token_invalid';
  if (errorCodes.includes('timeout-or-duplicate')) return 'turnstile_token_expired_or_duplicate';
  if (errorCodes.includes('missing-input-secret')) return 'turnstile_secret_missing';
  if (errorCodes.includes('invalid-input-secret')) return 'turnstile_secret_invalid';

  return 'turnstile_verification_failed';
}

export async function verifyTurnstileToken({ token, req }) {
  if (!TURNSTILE_ENABLED) {
    return { ok: true, skipped: true };
  }

  if (!TURNSTILE_SECRET_KEY) {
    return { ok: false, reason: 'turnstile_secret_missing' };
  }

  const responseToken = String(token || '').trim();
  if (!responseToken) {
    return { ok: false, reason: 'turnstile_token_missing' };
  }

  const form = new URLSearchParams();
  form.set('secret', TURNSTILE_SECRET_KEY);
  form.set('response', responseToken);

  const remoteIp = getRequesterIp(req);
  if (remoteIp) {
    form.set('remoteip', remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: form.toString(),
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS)
    });

    if (!response.ok) {
      return { ok: false, reason: 'turnstile_unavailable', status: response.status };
    }

    const data = await response.json();
    if (!data?.success) {
      const errorCodes = Array.isArray(data?.['error-codes']) ? data['error-codes'] : [];
      return {
        ok: false,
        reason: mapTurnstileError(errorCodes),
        errorCodes
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: 'turnstile_unavailable' };
  }
}
