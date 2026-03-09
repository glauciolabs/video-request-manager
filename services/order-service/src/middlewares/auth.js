import jwt from 'jsonwebtoken';

const USER_JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const SERVICE_JWT_SECRET = process.env.SERVICE_JWT_SECRET || 'change-me-too';

export function requireServiceToken(req, res, next) {
  const token = req.headers['x-service-token'];
  if (!token) {
    return res.status(401).json({ error: 'missing x-service-token' });
  }

  try {
    jwt.verify(token, SERVICE_JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid service token' });
  }
}

export function requireUserJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing bearer token' });
  }

  try {
    const payload = jwt.verify(auth.replace('Bearer ', ''), USER_JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid user token' });
  }
}

export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  };
}
