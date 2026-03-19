import pino from 'pino';
import pinoHttp from 'pino-http';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-service-token"]',
  'res.headers["set-cookie"]'
];

export const logger = pino({
  name: 'user-service',
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]'
  }
});
export const httpLogger = pinoHttp({ logger });
