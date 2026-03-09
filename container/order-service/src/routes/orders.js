import { Router } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sanitizeText } from '../lib/sanitize.js';
import { notifyOrderLifecycle } from '../lib/notifications.js';
import { requireRole, requireUserJWT } from '../middlewares/auth.js';

const router = Router();

// Temporary in-memory store for the initial scaffold.
const orders = [];
let nextOrderSequence = 1;
const INTAKE_STATUSES = ['new', 'triage', 'in_production', 'processing', 'done', 'cancelled'];
const INTAKE_PRIORITIES = ['normal', 'fast', 'urgent', 'weekend'];
const INTAKE_REQUEST_TYPES = ['new_video', 'add_photos'];
const INTAKE_TRANSITIONS = ['default_3s', '4s', '5s', '6s', 'custom'];
const NAME_REGEX = /^[\p{L}][\p{L}\p{M}' .-]{1,119}$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ONEDRIVE_FOLDER_REGEX = /^[A-Za-z0-9._-]{3,160}$/;
const TRACKING_CODE_REGEX = /^[A-Za-z0-9!@#$%^&*_=+\-?]{20}$/;
const TRACKING_SPECIALS = '!@#$%^&*_=+-?';
const TRACKING_ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TRACKING_CHARSET = `${TRACKING_ALNUM}${TRACKING_SPECIALS}`;
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'America/Sao_Paulo';
const STATUS_LABELS = {
  new: 'Novo',
  triage: 'Triagem',
  in_production: 'Em produção',
  processing: 'Processando',
  done: 'Concluído',
  cancelled: 'Cancelado'
};

const orderSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional().default(''),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  dueDate: z.string().optional()
});

const intakeSchema = z.object({
  requesterName: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(NAME_REGEX, { message: 'requesterName must contain only text characters' }),
  requesterEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .regex(EMAIL_REGEX, { message: 'invalid email format' }),
  requestType: z.enum(INTAKE_REQUEST_TYPES),
  oneDriveFolder: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .regex(ONEDRIVE_FOLDER_REGEX, { message: 'oneDriveFolder must use letters, numbers, dot, underscore or hyphen' }),
  totalFilesInFolder: z.coerce.number().int().min(1).max(50000),
  transition: z.enum(INTAKE_TRANSITIONS),
  priority: z.enum(INTAKE_PRIORITIES).default('normal'),
  observations: z.string().optional().default('')
});

const updateSchema = orderSchema.partial().extend({
  status: z.enum(['new', 'triage', 'in_production', 'processing', 'done', 'cancelled']).optional()
});

const lockStatuses = ['in_production', 'processing'];
const statusSchema = z.object({
  status: z.enum(['new', 'triage', 'in_production', 'processing', 'done', 'cancelled'])
});
const trackingSchema = z.object({
  code: z.string().regex(TRACKING_CODE_REGEX, { message: 'invalid tracking code format' })
});

function getIntakeTitle(data) {
  return data.requestType === 'new_video'
    ? `Novo vídeo - ${data.oneDriveFolder}`
    : `Adição de fotos e vídeos - ${data.oneDriveFolder}`;
}

function generateOrderNumber() {
  const value = `VRM-${String(nextOrderSequence).padStart(6, '0')}`;
  nextOrderSequence += 1;
  return value;
}

function normalizeOneDriveFolder(value) {
  return sanitizeText(value || '').trim().toLowerCase();
}

function randomChar(charset) {
  return charset[crypto.randomInt(0, charset.length)];
}

function shuffle(value) {
  const chars = value.split('');
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    const current = chars[i];
    chars[i] = chars[j];
    chars[j] = current;
  }
  return chars.join('');
}

function generateTrackingCode() {
  // Ensures mixed pattern: alphanumeric + special chars across exactly 20 chars.
  const base = [
    randomChar('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
    randomChar('abcdefghijklmnopqrstuvwxyz'),
    randomChar('0123456789'),
    randomChar(TRACKING_SPECIALS)
  ];

  while (base.length < 20) {
    base.push(randomChar(TRACKING_CHARSET));
  }

  return shuffle(base.join(''));
}

function hashTrackingCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function trackingMatches(order, rawCode) {
  return order.trackingCodeHash === hashTrackingCode(rawCode);
}

function matchesOrderReference(order, reference) {
  if (!reference) return false;
  return order.id === reference || String(order.orderNumber || '').toUpperCase() === String(reference).toUpperCase();
}

function isWeekendInBusinessTimezone(now = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: BUSINESS_TIMEZONE
  }).format(now);

  return weekday === 'Sat' || weekday === 'Sun';
}

function createHistoryEntry({ status, changedAt, note }) {
  return {
    id: uuidv4(),
    status,
    label: STATUS_LABELS[status] || status,
    changedAt,
    note: note || ''
  };
}

function toPublicOrder(order, { includeTrackingCode = false } = {}) {
  const data = {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    requesterName: order.requesterName,
    requesterEmail: order.requesterEmail,
    requestType: order.requestType,
    oneDriveFolder: order.oneDriveFolder,
    totalFilesInFolder: Number(order.totalFilesInFolder || 0),
    transition: order.transition,
    title: order.title,
    description: order.description,
    observations: order.observations,
    priority: order.priority,
    status: order.status,
    dueDate: order.dueDate,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    submittedAt: order.createdAt,
    statusHistory: (order.statusHistory || []).map((entry) => ({
      id: entry.id,
      status: entry.status,
      label: entry.label || STATUS_LABELS[entry.status] || entry.status,
      changedAt: entry.changedAt,
      note: entry.note || ''
    }))
  };

  if (includeTrackingCode) {
    data.trackingCode = order.trackingCode;
  }

  return data;
}

router.get('/intake', (req, res) => {
  const { status, priority } = req.query;
  const filtered = orders.filter((order) => {
    const byStatus = !status || order.status === status;
    const byPriority = !priority || order.priority === priority;
    return byStatus && byPriority;
  });

  return res.json(filtered.map((order) => toPublicOrder(order)));
});

router.get('/intake/summary', (req, res) => {
  const byStatus = Object.fromEntries(INTAKE_STATUSES.map((status) => [status, 0]));
  const byPriority = Object.fromEntries(INTAKE_PRIORITIES.map((priority) => [priority, 0]));
  const byRequestType = Object.fromEntries(INTAKE_REQUEST_TYPES.map((requestType) => [requestType, 0]));
  const byTransition = Object.fromEntries(INTAKE_TRANSITIONS.map((transition) => [transition, 0]));

  for (const order of orders) {
    if (Object.hasOwn(byStatus, order.status)) byStatus[order.status] += 1;
    if (Object.hasOwn(byPriority, order.priority)) byPriority[order.priority] += 1;
    if (Object.hasOwn(byRequestType, order.requestType)) byRequestType[order.requestType] += 1;
    if (Object.hasOwn(byTransition, order.transition)) byTransition[order.transition] += 1;
  }

  return res.json({
    total: orders.length,
    pending: byStatus.new + byStatus.triage,
    processing: byStatus.in_production + byStatus.processing,
    done: byStatus.done,
    byStatus,
    byPriority,
    byRequestType,
    byTransition
  });
});

router.post('/intake', async (req, res) => {
  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const data = parsed.data;
  const effectivePriority = isWeekendInBusinessTimezone() ? 'weekend' : data.priority;
  const normalizedFolder = normalizeOneDriveFolder(data.oneDriveFolder);
  const duplicateFolder = orders.some((order) => normalizeOneDriveFolder(order.oneDriveFolder) === normalizedFolder);
  if (duplicateFolder) {
    return res.status(409).json({
      error: 'one_drive_folder_already_exists',
      message: 'oneDriveFolder must be unique'
    });
  }

  const now = new Date().toISOString();
  const trackingCode = generateTrackingCode();

  const order = {
    id: uuidv4(),
    orderNumber: generateOrderNumber(),
    userId: null,
    requesterName: sanitizeText(data.requesterName),
    requesterEmail: sanitizeText(data.requesterEmail),
    requestType: data.requestType,
    oneDriveFolder: sanitizeText(data.oneDriveFolder),
    totalFilesInFolder: Number(data.totalFilesInFolder),
    transition: data.transition,
    title: getIntakeTitle(data),
    description: sanitizeText(data.observations || ''),
    observations: sanitizeText(data.observations || ''),
    priority: effectivePriority,
    status: 'new',
    dueDate: null,
    trackingCode,
    trackingCodeHash: hashTrackingCode(trackingCode),
    statusHistory: [
      createHistoryEntry({
        status: 'new',
        changedAt: now,
        note: 'Pedido enviado pelo formulário'
      })
    ],
    createdAt: now,
    updatedAt: now
  };

  orders.push(order);

  await notifyOrderLifecycle({
    type: 'new_order',
    order,
    message: `Pedido ${order.orderNumber} criado com status inicial "${STATUS_LABELS[order.status] || order.status}".`
  });

  return res.status(201).json(toPublicOrder(order, { includeTrackingCode: true }));
});

router.patch('/intake/:id/status', async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'order_not_found' });

  const current = orders[idx];
  const updated = {
    ...current,
    status: parsed.data.status,
    statusHistory: [
      ...(current.statusHistory || []),
      createHistoryEntry({
        status: parsed.data.status,
        changedAt: new Date().toISOString(),
        note: 'Atualização registrada pela área administrativa'
      })
    ],
    updatedAt: new Date().toISOString()
  };
  orders[idx] = updated;

  const type = updated.status === 'done' ? 'completed' : 'status_changed';
  const previousStatus = STATUS_LABELS[current.status] || current.status;
  const nextStatus = STATUS_LABELS[updated.status] || updated.status;
  await notifyOrderLifecycle({
    type,
    order: updated,
    message: `Status alterado de "${previousStatus}" para "${nextStatus}".`
  });

  return res.json(toPublicOrder(updated));
});

router.get('/intake/:id/tracking', (req, res) => {
  const parsed = trackingSchema.safeParse({ code: req.query.code });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const order = orders.find((item) => matchesOrderReference(item, req.params.id));
  if (!order) return res.status(404).json({ error: 'tracking_not_found' });

  if (!trackingMatches(order, parsed.data.code)) {
    return res.status(404).json({ error: 'tracking_not_found' });
  }

  return res.json(toPublicOrder(order));
});

router.get('/', requireUserJWT, (req, res) => {
  const scopedOrders = req.user.role === 'admin'
    ? orders
    : orders.filter((o) => o.userId === req.user.sub);

  return res.json(scopedOrders);
});

router.post('/', requireUserJWT, requireRole(['client', 'admin']), (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const now = new Date().toISOString();
  const data = parsed.data;

  const order = {
    id: uuidv4(),
    userId: req.user.sub,
    title: sanitizeText(data.title),
    description: sanitizeText(data.description),
    priority: data.priority,
    status: 'new',
    dueDate: data.dueDate || null,
    createdAt: now,
    updatedAt: now
  };

  orders.push(order);

  // TODO: emit event to notification-service: NEW_ORDER.
  return res.status(201).json(order);
});

router.put('/:id', requireUserJWT, requireRole(['client', 'admin']), (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'order_not_found' });

  const existing = orders[idx];
  const canEdit = req.user.role === 'admin' || existing.userId === req.user.sub;
  if (!canEdit) return res.status(403).json({ error: 'forbidden' });

  // Rule requested: client cannot edit when order enters production/processing.
  if (req.user.role === 'client' && lockStatuses.includes(existing.status)) {
    return res.status(409).json({ error: 'order_locked_for_client' });
  }

  const updated = {
    ...existing,
    ...parsed.data,
    title: parsed.data.title ? sanitizeText(parsed.data.title) : existing.title,
    description: parsed.data.description ? sanitizeText(parsed.data.description) : existing.description,
    updatedAt: new Date().toISOString()
  };

  orders[idx] = updated;
  return res.json(updated);
});

router.delete('/:id', requireUserJWT, requireRole(['admin']), (req, res) => {
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'order_not_found' });
  orders.splice(idx, 1);
  return res.status(204).send();
});

export { router as ordersRouter };
