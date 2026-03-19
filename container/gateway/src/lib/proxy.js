import jwt from 'jsonwebtoken';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

const SERVICE_JWT_SECRET = requiredEnv('SERVICE_JWT_SECRET');
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000);

function createServiceToken() {
  return jwt.sign({ service: 'api-gateway' }, SERVICE_JWT_SECRET, { expiresIn: '5m' });
}

function readHeaderValue(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value).trim();
}

export async function proxyRequest(req, res, targetBase, routePrefix) {
  const destination = `${targetBase}${req.originalUrl.replace(routePrefix, '') || '/'}`;
  const forwardedFor = readHeaderValue(req.headers['x-forwarded-for']);
  const realIp = readHeaderValue(
    req.headers['cf-connecting-ip']
      || req.headers['x-real-ip']
      || req.ip
      || req.socket?.remoteAddress
  );

  const headers = {
    'Content-Type': 'application/json',
    'x-service-token': createServiceToken()
  };

  if (req.headers.authorization) {
    headers.Authorization = req.headers.authorization;
  }
  if (forwardedFor) {
    headers['x-forwarded-for'] = forwardedFor;
  } else if (realIp) {
    headers['x-forwarded-for'] = realIp;
  }
  if (realIp) {
    headers['x-real-ip'] = realIp;
  }

  try {
    const response = await fetch(destination, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type');
    res.status(response.status);
    if (contentType) {
      res.setHeader('content-type', contentType);
    }
    return res.send(text);
  } catch (error) {
    return res.status(502).json({
      error: 'upstream_unavailable',
      upstream: targetBase,
      reason: error?.code || error?.name || 'unknown_error'
    });
  }
}
