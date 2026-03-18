import jwt from 'jsonwebtoken';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

const SERVICE_JWT_SECRET = requiredEnv('SERVICE_JWT_SECRET');

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
