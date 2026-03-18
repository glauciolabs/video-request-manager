import rateLimit from 'express-rate-limit';

// Base rate limit. In Kubernetes + Contour you can move this policy to the edge.
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' }
});

// Extra protection for form-entry password endpoint (anti bruteforce at gateway layer).
export const formAccessRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Math.max(1, Number(process.env.FORM_ACCESS_RATE_LIMIT_MAX || 10)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_form_access_attempts' }
});
