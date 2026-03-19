import { Router } from 'express';
import { z } from 'zod';
import { classifySla, slaByPriority } from '../lib/sla-policy.js';
import { requireAdmin, requireUserJWT } from '../middlewares/auth.js';

const router = Router();

const evaluationSchema = z.object({
  orders: z.array(z.object({
    id: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    dueDate: z.string().optional(),
    status: z.string().optional()
  }))
});

const updatePolicySchema = z.object({
  low: z.number().int().positive().optional(),
  medium: z.number().int().positive().optional(),
  high: z.number().int().positive().optional(),
  critical: z.number().int().positive().optional()
});

router.get('/policy', requireUserJWT, requireAdmin, (req, res) => {
  return res.json(slaByPriority);
});

router.put('/policy', requireUserJWT, requireAdmin, (req, res) => {
  const parsed = updatePolicySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  Object.assign(slaByPriority, parsed.data);
  return res.json(slaByPriority);
});

router.post('/evaluate', requireUserJWT, (req, res) => {
  const parsed = evaluationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const evaluations = parsed.data.orders.map((order) => {
    const sla = classifySla(order);
    return {
      orderId: order.id,
      priority: order.priority,
      ...sla
    };
  });

  // TODO: dispatch near_due/overdue alerts to notification-service.
  return res.json({ evaluations });
});

export { router as slaRouter };
