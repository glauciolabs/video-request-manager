import { logger } from '../lib/logger.js';

export function errorHandler(err, req, res, next) {
  logger.error({ err, path: req.path }, 'unhandled error');
  return res.status(500).json({ error: 'internal_error' });
}
