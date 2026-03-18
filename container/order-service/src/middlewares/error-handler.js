import { logger } from '../lib/logger.js';

export function errorHandler(err, req, res, next) {
  const message = String(err?.message || '');
  const lowered = message.toLowerCase();

  logger.error({ err, path: req.path }, 'unhandled error');

  if (lowered.startsWith('d1_') || lowered.includes(' sqlite_') || lowered.includes('sqlite_')) {
    return res.status(503).json({
      error: 'data_backend_unavailable',
      message: 'data_backend_unavailable',
      reason: message.slice(0, 300)
    });
  }

  return res.status(500).json({ error: 'internal_error' });
}
