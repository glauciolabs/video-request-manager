import crypto from 'crypto';

// Simple hash for scaffold. Replace with bcrypt/argon2 in production.
export function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}
