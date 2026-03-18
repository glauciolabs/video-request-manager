import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import { gatewayRouter } from './routes/index.js';
import { apiRateLimit } from './middlewares/rate-limit.js';
import { httpLogger, logger } from './lib/logger.js';
import { sanitizeValue } from './lib/sanitize.js';

dotenv.config();

const app = express();
const port = Number(process.env.GATEWAY_PORT || 8080);
const trustProxyRaw = String(process.env.TRUST_PROXY || 'true').trim().toLowerCase();
const trustProxy = trustProxyRaw === 'true'
  ? true
  : trustProxyRaw === 'false'
    ? false
    : Number.isNaN(Number(trustProxyRaw))
      ? true
      : Number(trustProxyRaw);
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3006')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

app.set('trust proxy', trustProxy);

function isAllowedOrigin(origin) {
  return allowedOrigins.includes(origin);
}

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(null, false);
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(httpLogger);
app.use(apiRateLimit);

// Basic browser-side CSRF mitigation by validating Origin for state-changing requests.
app.use((req, res, next) => {
  if (!unsafeMethods.has(req.method)) return next();

  const origin = req.headers.origin;
  if (!origin) return next();

  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'csrf_blocked_origin' });
  }

  return next();
});

// Basic sanitization before forwarding to internal services.
app.use((req, _res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  return next();
});

app.use('/', gatewayRouter);

app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, 'gateway error');
  return res.status(500).json({ error: 'internal_error' });
});

app.listen(port, () => {
  logger.info({ port }, 'api-gateway started');
});
