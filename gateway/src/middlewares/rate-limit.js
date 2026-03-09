import rateLimit from 'express-rate-limit';

// Base rate limit. In Kubernetes + Contour you can move this policy to the edge.
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' }
});
