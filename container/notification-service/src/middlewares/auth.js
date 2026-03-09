import jwt from 'jsonwebtoken';

const SERVICE_JWT_SECRET = process.env.SERVICE_JWT_SECRET || 'change-me-too';

export function requireServiceToken(req, res, next) {
  const token = req.headers['x-service-token'];
  if (!token) return res.status(401).json({ error: 'missing x-service-token' });

  try {
    jwt.verify(token, SERVICE_JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid service token' });
  }
}
