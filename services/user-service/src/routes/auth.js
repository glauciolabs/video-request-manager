import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { hashPassword } from '../lib/crypto.js';
import { verifyTurnstileToken } from '../lib/turnstile.js';
import { requireUserJWT } from '../middlewares/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const users = [
  {
    id: 'seed-admin',
    email: 'admin@local.dev',
    passwordHash: hashPassword('admin123'),
    role: 'admin'
  }
];

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['client', 'admin']).default('client')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  turnstileToken: z.string().trim().max(4096).optional().default('')
});

router.post('/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const exists = users.find((u) => u.email === parsed.data.email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'email_already_exists' });

  const user = {
    id: uuidv4(),
    email: parsed.data.email.toLowerCase(),
    passwordHash: hashPassword(parsed.data.password),
    role: parsed.data.role
  };

  users.push(user);

  return res.status(201).json({ id: user.id, email: user.email, role: user.role });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const turnstile = await verifyTurnstileToken({
    token: parsed.data.turnstileToken,
    req
  });
  if (!turnstile.ok) {
    return res.status(400).json({
      error: 'turnstile_verification_failed',
      reason: turnstile.reason || 'unknown'
    });
  }

  const user = users.find((u) => u.email === parsed.data.email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });

  const validPassword = user.passwordHash === hashPassword(parsed.data.password);
  if (!validPassword) return res.status(401).json({ error: 'invalid_credentials' });

  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });

  return res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

router.get('/me', requireUserJWT, (req, res) => {
  const found = users.find((u) => u.id === req.user.sub);
  if (!found) return res.status(404).json({ error: 'user_not_found' });

  return res.json({ id: found.id, email: found.email, role: found.role });
});

// Optional integration point for Microsoft Entra ID token validation.
router.post('/entra/callback', (req, res) => {
  return res.status(501).json({ error: 'not_implemented', hint: 'Integrate MSAL / OIDC flow here.' });
});

export { router as authRouter };
