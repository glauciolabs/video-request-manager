import jwt from 'jsonwebtoken';

const SERVICE_JWT_SECRET = process.env.SERVICE_JWT_SECRET || 'change-me-too';

function createServiceToken() {
  return jwt.sign({ service: 'api-gateway' }, SERVICE_JWT_SECRET, { expiresIn: '5m' });
}

export async function proxyRequest(req, res, targetBase, routePrefix) {
  const destination = `${targetBase}${req.originalUrl.replace(routePrefix, '') || '/'}`;

  const headers = {
    'Content-Type': 'application/json',
    'x-service-token': createServiceToken()
  };

  if (req.headers.authorization) {
    headers.Authorization = req.headers.authorization;
  }

  try {
    const response = await fetch(destination, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(10000)
    });

    const text = await response.text();
    res.status(response.status);
    return res.send(text);
  } catch (error) {
    return res.status(502).json({
      error: 'upstream_unavailable',
      upstream: targetBase,
      reason: error?.code || error?.name || 'unknown_error'
    });
  }
}
