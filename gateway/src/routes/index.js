import { Router } from 'express';
import { proxyRequest } from '../lib/proxy.js';
import { enforceAdminAccess } from '../middlewares/auth-mode.js';

const router = Router();

const targets = {
  auth: `${process.env.USER_SERVICE_URL || 'http://localhost:3002'}/auth`,
  orders: `${process.env.ORDER_SERVICE_URL || 'http://localhost:3001'}/orders`,
  notifications: `${process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003'}/notifications`,
  sla: `${process.env.SLA_SERVICE_URL || 'http://localhost:3004'}/sla`,
  reports: `${process.env.REPORT_SERVICE_URL || 'http://localhost:3005'}/reports`
};

router.get('/health', (_, res) => res.json({ status: 'ok', service: 'api-gateway' }));

// Keep client intake endpoint public, but protect admin read/update operations based on AUTH_MODE.
router.get('/orders/intake', enforceAdminAccess, (req, res) => proxyRequest(req, res, targets.orders, '/orders'));
router.get('/orders/intake/summary', enforceAdminAccess, (req, res) => proxyRequest(req, res, targets.orders, '/orders'));
router.patch('/orders/intake/:id/status', enforceAdminAccess, (req, res) => proxyRequest(req, res, targets.orders, '/orders'));
router.get('/notifications', enforceAdminAccess, (req, res) => proxyRequest(req, res, targets.notifications, '/notifications'));

router.use('/auth', (req, res) => proxyRequest(req, res, targets.auth, '/auth'));
router.use('/orders', (req, res) => proxyRequest(req, res, targets.orders, '/orders'));
router.use('/notifications', (req, res) => proxyRequest(req, res, targets.notifications, '/notifications'));
router.use('/sla', (req, res) => proxyRequest(req, res, targets.sla, '/sla'));
router.use('/reports', (req, res) => proxyRequest(req, res, targets.reports, '/reports'));

export { router as gatewayRouter };
