import { Router } from 'express';
import { requireAdmin, requireUserJWT } from '../middlewares/auth.js';

const router = Router();

const mockOrders = [
  { id: 'ord-001', status: 'new', priority: 'high' },
  { id: 'ord-002', status: 'processing', priority: 'critical' },
  { id: 'ord-003', status: 'done', priority: 'medium' },
  { id: 'ord-004', status: 'done', priority: 'high' }
];

router.get('/summary', requireUserJWT, requireAdmin, (req, res) => {
  const byStatus = mockOrders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  const byPriority = mockOrders.reduce((acc, order) => {
    acc[order.priority] = (acc[order.priority] || 0) + 1;
    return acc;
  }, {});

  return res.json({ total: mockOrders.length, byStatus, byPriority });
});

router.get('/simple', requireUserJWT, requireAdmin, (req, res) => {
  return res.json({
    series: [
      { label: 'new', value: 1 },
      { label: 'processing', value: 1 },
      { label: 'done', value: 2 }
    ]
  });
});

export { router as reportsRouter };
