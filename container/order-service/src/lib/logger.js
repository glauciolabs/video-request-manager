import pino from 'pino';
import pinoHttp from 'pino-http';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-service-token"]',
  'res.headers["set-cookie"]'
];

export const logger = pino({
  name: 'order-service',
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]'
  }
});

// Structured request logs (JSON) for centralized observability.
export const httpLogger = pinoHttp({ logger });
