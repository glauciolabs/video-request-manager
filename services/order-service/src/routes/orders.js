import { Router } from 'express';
import crypto from 'crypto';
import { isIP } from 'node:net';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sanitizeText } from '../lib/sanitize.js';
import { notifyOrderLifecycle } from '../lib/notifications.js';
import { verifyTurnstileToken } from '../lib/turnstile.js';
import { requireRole, requireUserJWT } from '../middlewares/auth.js';

const router = Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const ORDER_DATA_BACKEND_RAW = String(process.env.ORDER_DATA_BACKEND || process.env.DATA_BACKEND || 'memory')
  .trim()
  .toLowerCase();
const ORDER_DATA_BACKEND = ORDER_DATA_BACKEND_RAW === 'd1' ? 'd1' : 'memory';

// Temporary in-memory store for local/dev when backend=memory.
const orders = [];
let nextOrderSequence = 1;

const INTAKE_STATUSES = ['awaiting_payment', 'new', 'triage', 'in_production', 'processing', 'done', 'cancelled'];
const INTAKE_PRIORITIES = ['normal', 'fast', 'urgent', 'weekend'];
const INTAKE_REQUEST_TYPES = ['new_video', 'add_photos'];
const INTAKE_TRANSITIONS = ['default_3s', '4s', '5s', '6s', 'custom'];
const NAME_REGEX = /^[\p{L}][\p{L}\p{M}' .-]{1,119}$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TRACKING_CODE_REGEX = /^(?:[A-HJ-NP-Z2-9]{8}|[A-Za-z0-9!@#$%^&*_=+\-?]{20})$/;
const TRACKING_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TRACKING_CODE_LENGTH = 8;
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'America/Sao_Paulo';

const D1_ACCOUNT_ID = String(process.env.D1_ACCOUNT_ID || '').trim();
const D1_DATABASE_ID = String(process.env.D1_DATABASE_ID || '').trim();
const D1_API_TOKEN = String(process.env.D1_API_TOKEN || '').trim();
const D1_API_BASE_URL = String(process.env.D1_API_BASE_URL || 'https://api.cloudflare.com/client/v4').replace(/\/+$/, '');
const D1_TIMEOUT_MS = Number(process.env.D1_TIMEOUT_MS || 8000);

if (ORDER_DATA_BACKEND === 'd1') {
  const missing = [];
  if (!D1_ACCOUNT_ID) missing.push('D1_ACCOUNT_ID');
  if (!D1_DATABASE_ID) missing.push('D1_DATABASE_ID');
  if (!D1_API_TOKEN) missing.push('D1_API_TOKEN');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s) for D1 backend: ${missing.join(', ')}`);
  }
}

const STATUS_LABELS = {
  awaiting_payment: 'Aguardando pagamento',
  new: 'Novo',
  triage: 'Triagem',
  in_production: 'Em producao',
  processing: 'Processando',
  done: 'Concluido',
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
  assetsReadyConfirmed: z.boolean().refine((value) => value === true, {
    message: 'assetsReadyConfirmed must be true'
  }),
  transition: z.enum(INTAKE_TRANSITIONS),
  priority: z.enum(INTAKE_PRIORITIES).default('normal'),
  observations: z.string().optional().default(''),
  turnstileToken: z.string().trim().max(4096).optional().default('')
});

const updateSchema = orderSchema.partial().extend({
  status: z.enum(['awaiting_payment', 'new', 'triage', 'in_production', 'processing', 'done', 'cancelled']).optional()
});

const lockStatuses = ['in_production', 'processing'];
const statusSchema = z.object({
  status: z.enum(['awaiting_payment', 'new', 'triage', 'in_production', 'processing', 'done', 'cancelled'])
});
const trackingSchema = z.object({
  code: z.string().regex(TRACKING_CODE_REGEX, { message: 'invalid tracking code format' })
});

let d1SchemaInitPromise;

function getIntakeTitle(data) {
  return data.requestType === 'new_video'
    ? 'Solicitação de novo vídeo'
    : 'Adição de fotos e vídeos';
}

function normalizeIpCandidate(value) {
  if (!value) return '';
  let candidate = String(value).trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
  if (!candidate || candidate.toLowerCase() === 'unknown') return '';

  if (candidate.startsWith('[') && candidate.includes(']')) {
    candidate = candidate.slice(1, candidate.indexOf(']'));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.split(':')[0];
  }

  if (candidate.includes('%')) {
    candidate = candidate.split('%')[0];
  }

  if (candidate.startsWith('::ffff:')) {
    const mapped = candidate.slice(7);
    if (isIP(mapped) === 4) return mapped;
  }

  return isIP(candidate) ? candidate : '';
}

function getRequesterIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedValues = Array.isArray(forwarded)
    ? forwarded.join(',')
    : String(forwarded || '');
  const firstForwarded = forwardedValues.split(',').map((entry) => entry.trim()).find(Boolean);

  return (
    normalizeIpCandidate(firstForwarded)
    || normalizeIpCandidate(req.headers['x-real-ip'])
    || normalizeIpCandidate(req.ip)
    || normalizeIpCandidate(req.socket?.remoteAddress)
    || 'unknown'
  );
}

function randomChar(charset) {
  return charset[crypto.randomInt(0, charset.length)];
}

function generateTrackingCode() {
  let code = '';
  for (let i = 0; i < TRACKING_CODE_LENGTH; i += 1) {
    code += randomChar(TRACKING_CHARSET);
  }
  return code;
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

function rowToOrder(row) {
  const statusHistory = (() => {
    try {
      const parsed = JSON.parse(String(row.status_history_json || '[]'));
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  })();

  return {
    id: row.id,
    orderNumber: row.order_number || null,
    userId: row.user_id || null,
    requesterName: row.requester_name || '',
    requesterEmail: row.requester_email || '',
    requestIp: row.request_ip || 'unknown',
    requestType: row.request_type || null,
    assetsReadyConfirmed: Boolean(Number(row.assets_ready_confirmed || 0)),
    oneDriveFolder: row.one_drive_folder || '',
    totalFilesInFolder: row.total_files_in_folder == null ? 0 : Number(row.total_files_in_folder),
    transition: row.transition || null,
    title: row.title || '',
    description: row.description || '',
    observations: row.observations || '',
    priority: row.priority || 'normal',
    status: row.status || 'new',
    dueDate: row.due_date || null,
    trackingCode: row.tracking_code || null,
    trackingCodeHash: row.tracking_code_hash || '',
    statusHistory,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toPublicOrder(order, { includeTrackingCode = false } = {}) {
  const data = {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    requesterName: order.requesterName,
    requesterEmail: order.requesterEmail,
    requestIp: order.requestIp || 'unknown',
    requestType: order.requestType,
    assetsReadyConfirmed: Boolean(order.assetsReadyConfirmed),
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

function parseD1ApiError(payload, fallback = 'd1_query_failed') {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (errors.length > 0) {
    return errors.map((err) => err?.message || String(err)).join('; ');
  }
  return fallback;
}

function isDuplicateColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('duplicate column name')
    || (message.includes('duplicate') && message.includes('column'))
    || message.includes('already exists')
  );
}

async function d1Call(sql, params = [], { skipInit = false } = {}) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    throw new Error('d1_backend_not_enabled');
  }

  if (!skipInit) {
    await ensureD1Schema();
  }

  const endpoint = `${D1_API_BASE_URL}/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${D1_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(D1_TIMEOUT_MS)
  });

  if (!response.ok) {
    const rawBody = await response.text();
    let detail = '';
    try {
      const parsed = JSON.parse(rawBody);
      detail = parseD1ApiError(parsed, '');
    } catch {
      detail = '';
    }
    if (!detail && rawBody) {
      detail = rawBody.slice(0, 300);
    }
    throw new Error(detail ? `d1_http_${response.status}: ${detail}` : `d1_http_${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.success) {
    throw new Error(parseD1ApiError(payload));
  }

  const statement = Array.isArray(payload.result) ? payload.result[0] : null;
  if (!statement?.success) {
    throw new Error(parseD1ApiError(statement, 'd1_statement_failed'));
  }

  return statement;
}

async function ensureD1Schema() {
  if (ORDER_DATA_BACKEND !== 'd1') return;
  if (d1SchemaInitPromise) return d1SchemaInitPromise;

  d1SchemaInitPromise = (async () => {
    await d1Call(
      `CREATE TABLE IF NOT EXISTS vrm_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE,
        user_id TEXT,
        requester_name TEXT,
        requester_email TEXT,
        request_ip TEXT,
        request_type TEXT,
        assets_ready_confirmed INTEGER DEFAULT 0,
        one_drive_folder TEXT,
        one_drive_folder_normalized TEXT UNIQUE,
        total_files_in_folder INTEGER,
        transition TEXT,
        title TEXT,
        description TEXT,
        observations TEXT,
        priority TEXT,
        status TEXT,
        due_date TEXT,
        tracking_code TEXT,
        tracking_code_hash TEXT,
        status_history_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      [],
      { skipInit: true }
    );

    await d1Call(
      'CREATE INDEX IF NOT EXISTS idx_vrm_orders_status ON vrm_orders(status)',
      [],
      { skipInit: true }
    );
    await d1Call(
      'CREATE INDEX IF NOT EXISTS idx_vrm_orders_priority ON vrm_orders(priority)',
      [],
      { skipInit: true }
    );
    await d1Call(
      'CREATE INDEX IF NOT EXISTS idx_vrm_orders_user_id ON vrm_orders(user_id)',
      [],
      { skipInit: true }
    );

    await d1Call(
      `CREATE TABLE IF NOT EXISTS vrm_order_sequence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL
      )`,
      [],
      { skipInit: true }
    );

    // Backward-compatible migration for existing D1 tables.
    try {
      await d1Call(
        'ALTER TABLE vrm_orders ADD COLUMN assets_ready_confirmed INTEGER DEFAULT 0',
        [],
        { skipInit: true }
      );
    } catch (error) {
      if (!isDuplicateColumnError(error)) {
        throw error;
      }
    }
  })();

  await d1SchemaInitPromise;
}

async function generateOrderNumber() {
  if (ORDER_DATA_BACKEND !== 'd1') {
    const value = `VRM-${String(nextOrderSequence).padStart(6, '0')}`;
    nextOrderSequence += 1;
    return value;
  }

  const now = new Date().toISOString();
  const inserted = await d1Call(
    'INSERT INTO vrm_order_sequence (created_at) VALUES (?) RETURNING id',
    [now]
  );

  let seq = Number(inserted?.results?.[0]?.id || 0);
  if (!Number.isFinite(seq) || seq <= 0) {
    const fallback = await d1Call('SELECT MAX(id) AS seq FROM vrm_order_sequence', []);
    seq = Number(fallback?.results?.[0]?.seq || 0);
  }

  if (!Number.isFinite(seq) || seq <= 0) {
    throw new Error('d1_sequence_error');
  }

  return `VRM-${String(seq).padStart(6, '0')}`;
}

async function listIntakeOrders({ status, priority } = {}) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    return orders.filter((order) => {
      const byStatus = !status || order.status === status;
      const byPriority = !priority || order.priority === priority;
      return byStatus && byPriority;
    });
  }

  const where = ['order_number IS NOT NULL'];
  const params = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  if (priority) {
    where.push('priority = ?');
    params.push(priority);
  }

  const sql = `
    SELECT *
    FROM vrm_orders
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(created_at) DESC
  `;
  const result = await d1Call(sql, params);
  return (result.results || []).map(rowToOrder);
}

async function findIntakeByReference(reference) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    return orders.find((item) => matchesOrderReference(item, reference)) || null;
  }

  const sql = `
    SELECT *
    FROM vrm_orders
    WHERE order_number IS NOT NULL
      AND (id = ? OR UPPER(order_number) = UPPER(?))
    LIMIT 1
  `;
  const result = await d1Call(sql, [reference, reference]);
  const row = (result.results || [])[0];
  return row ? rowToOrder(row) : null;
}

async function createIntakeOrderRecord(order) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    orders.push(order);
    return;
  }

  const sql = `
    INSERT INTO vrm_orders (
      id,
      order_number,
      user_id,
      requester_name,
      requester_email,
      request_ip,
      request_type,
      assets_ready_confirmed,
      one_drive_folder,
      one_drive_folder_normalized,
      total_files_in_folder,
      transition,
      title,
      description,
      observations,
      priority,
      status,
      due_date,
      tracking_code,
      tracking_code_hash,
      status_history_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await d1Call(sql, [
    order.id,
    order.orderNumber,
    order.userId,
    order.requesterName,
    order.requesterEmail,
    order.requestIp,
    order.requestType,
    order.assetsReadyConfirmed ? 1 : 0,
    order.oneDriveFolder,
    null,
    order.totalFilesInFolder,
    order.transition,
    order.title,
    order.description,
    order.observations,
    order.priority,
    order.status,
    order.dueDate,
    order.trackingCode,
    order.trackingCodeHash,
    JSON.stringify(order.statusHistory || []),
    order.createdAt,
    order.updatedAt
  ]);
}

async function updateIntakeStatusRecord(orderId, nextStatus) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return null;

    const current = orders[idx];
    const updated = {
      ...current,
      status: nextStatus,
      statusHistory: [
        ...(current.statusHistory || []),
        createHistoryEntry({
          status: nextStatus,
          changedAt: new Date().toISOString(),
          note: 'Atualizacao registrada pela area administrativa'
        })
      ],
      updatedAt: new Date().toISOString()
    };

    orders[idx] = updated;
    return updated;
  }

  const currentResult = await d1Call(
    'SELECT * FROM vrm_orders WHERE id = ? AND order_number IS NOT NULL LIMIT 1',
    [orderId]
  );
  const currentRow = (currentResult.results || [])[0];
  if (!currentRow) return null;

  const current = rowToOrder(currentRow);
  const updated = {
    ...current,
    status: nextStatus,
    statusHistory: [
      ...(current.statusHistory || []),
      createHistoryEntry({
        status: nextStatus,
        changedAt: new Date().toISOString(),
        note: 'Atualizacao registrada pela area administrativa'
      })
    ],
    updatedAt: new Date().toISOString()
  };

  await d1Call(
    'UPDATE vrm_orders SET status = ?, status_history_json = ?, updated_at = ? WHERE id = ?',
    [
      updated.status,
      JSON.stringify(updated.statusHistory || []),
      updated.updatedAt,
      updated.id
    ]
  );

  return updated;
}

async function listScopedOrders(user) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    return user.role === 'admin'
      ? orders
      : orders.filter((o) => o.userId === user.sub);
  }

  if (user.role === 'admin') {
    const result = await d1Call('SELECT * FROM vrm_orders ORDER BY datetime(created_at) DESC', []);
    return (result.results || []).map(rowToOrder);
  }

  const result = await d1Call(
    'SELECT * FROM vrm_orders WHERE user_id = ? ORDER BY datetime(created_at) DESC',
    [user.sub]
  );
  return (result.results || []).map(rowToOrder);
}

async function createApiOrderRecord(order) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    orders.push(order);
    return;
  }

  const sql = `
    INSERT INTO vrm_orders (
      id,
      order_number,
      user_id,
      requester_name,
      requester_email,
      request_ip,
      request_type,
      one_drive_folder,
      one_drive_folder_normalized,
      total_files_in_folder,
      transition,
      title,
      description,
      observations,
      priority,
      status,
      due_date,
      tracking_code,
      tracking_code_hash,
      status_history_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await d1Call(sql, [
    order.id,
    null,
    order.userId,
    null,
    null,
    order.requestIp,
    null,
    null,
    null,
    null,
    null,
    order.title,
    order.description,
    null,
    order.priority,
    order.status,
    order.dueDate,
    null,
    null,
    JSON.stringify(order.statusHistory || []),
    order.createdAt,
    order.updatedAt
  ]);
}

async function findOrderById(orderId) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    return orders.find((o) => o.id === orderId) || null;
  }

  const result = await d1Call('SELECT * FROM vrm_orders WHERE id = ? LIMIT 1', [orderId]);
  const row = (result.results || [])[0];
  return row ? rowToOrder(row) : null;
}

async function updateApiOrderRecord(order) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    const idx = orders.findIndex((o) => o.id === order.id);
    if (idx !== -1) orders[idx] = order;
    return;
  }

  await d1Call(
    `UPDATE vrm_orders
     SET title = ?, description = ?, priority = ?, status = ?, due_date = ?, updated_at = ?
     WHERE id = ?`,
    [
      order.title,
      order.description,
      order.priority,
      order.status,
      order.dueDate,
      order.updatedAt,
      order.id
    ]
  );
}

async function deleteOrderRecord(orderId) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return false;
    orders.splice(idx, 1);
    return true;
  }

  const existing = await findOrderById(orderId);
  if (!existing) return false;

  await d1Call('DELETE FROM vrm_orders WHERE id = ?', [orderId]);
  return true;
}

async function deleteIntakeRecord(orderId) {
  if (ORDER_DATA_BACKEND !== 'd1') {
    const idx = orders.findIndex((o) => o.id === orderId && o.orderNumber);
    if (idx === -1) return false;
    orders.splice(idx, 1);
    return true;
  }

  const result = await d1Call(
    'SELECT id FROM vrm_orders WHERE id = ? AND order_number IS NOT NULL LIMIT 1',
    [orderId]
  );
  if (!(result.results || []).length) return false;

  await d1Call('DELETE FROM vrm_orders WHERE id = ? AND order_number IS NOT NULL', [orderId]);
  return true;
}

router.get('/intake', asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const priority = typeof req.query.priority === 'string' ? req.query.priority : '';

  const filtered = await listIntakeOrders({ status, priority });
  return res.json(filtered.map((order) => toPublicOrder(order)));
}));

router.get('/intake/summary', asyncHandler(async (req, res) => {
  const byStatus = Object.fromEntries(INTAKE_STATUSES.map((status) => [status, 0]));
  const byPriority = Object.fromEntries(INTAKE_PRIORITIES.map((priority) => [priority, 0]));
  const byRequestType = Object.fromEntries(INTAKE_REQUEST_TYPES.map((requestType) => [requestType, 0]));
  const byTransition = Object.fromEntries(INTAKE_TRANSITIONS.map((transition) => [transition, 0]));

  const intakeOrders = await listIntakeOrders();
  for (const order of intakeOrders) {
    if (Object.hasOwn(byStatus, order.status)) byStatus[order.status] += 1;
    if (Object.hasOwn(byPriority, order.priority)) byPriority[order.priority] += 1;
    if (Object.hasOwn(byRequestType, order.requestType)) byRequestType[order.requestType] += 1;
    if (Object.hasOwn(byTransition, order.transition)) byTransition[order.transition] += 1;
  }

  return res.json({
    total: intakeOrders.length,
    pending: byStatus.awaiting_payment + byStatus.new + byStatus.triage,
    processing: byStatus.in_production + byStatus.processing,
    done: byStatus.done,
    byStatus,
    byPriority,
    byRequestType,
    byTransition
  });
}));

router.post('/intake', asyncHandler(async (req, res) => {
  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const data = parsed.data;
  const turnstile = await verifyTurnstileToken({
    token: data.turnstileToken,
    req
  });
  if (!turnstile.ok) {
    return res.status(400).json({
      error: 'turnstile_verification_failed',
      reason: turnstile.reason || 'unknown'
    });
  }

  const effectivePriority = isWeekendInBusinessTimezone() ? 'weekend' : data.priority;

  const now = new Date().toISOString();
  const trackingCode = generateTrackingCode();

  const order = {
    id: uuidv4(),
    orderNumber: await generateOrderNumber(),
    userId: null,
    requesterName: sanitizeText(data.requesterName),
    requesterEmail: sanitizeText(data.requesterEmail),
    requestIp: getRequesterIp(req),
    requestType: data.requestType,
    assetsReadyConfirmed: Boolean(data.assetsReadyConfirmed),
    oneDriveFolder: '',
    totalFilesInFolder: 0,
    transition: data.transition,
    title: getIntakeTitle(data),
    description: sanitizeText(data.observations || ''),
    observations: sanitizeText(data.observations || ''),
    priority: effectivePriority,
    status: 'awaiting_payment',
    dueDate: null,
    trackingCode,
    trackingCodeHash: hashTrackingCode(trackingCode),
    statusHistory: [
      createHistoryEntry({
        status: 'awaiting_payment',
        changedAt: now,
        note: 'Pedido enviado e aguardando pagamento'
      })
    ],
    createdAt: now,
    updatedAt: now
  };

  await createIntakeOrderRecord(order);

  // Do not block request completion on external notification channels.
  // This avoids gateway timeout when SMTP/Telegram providers are slow.
  void notifyOrderLifecycle({
    type: 'new_order',
    order,
    message: `Pedido ${order.orderNumber} criado com status inicial "${STATUS_LABELS[order.status] || order.status}". Aguardando pagamento para iniciar a produção.`
  }).catch((error) => {
    console.error('notifyOrderLifecycle(new_order) failed', {
      orderId: order.id,
      error: error?.message || String(error)
    });
  });

  return res.status(201).json(toPublicOrder(order, { includeTrackingCode: true }));
}));

router.patch('/intake/:id/status', asyncHandler(async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updated = await updateIntakeStatusRecord(req.params.id, parsed.data.status);
  if (!updated) return res.status(404).json({ error: 'order_not_found' });

  const previousHistory = updated.statusHistory || [];
  const previousEntry = previousHistory.length >= 2 ? previousHistory[previousHistory.length - 2] : null;
  const previousStatus = previousEntry?.status || updated.status;

  const type = updated.status === 'done' ? 'completed' : 'status_changed';
  const previousStatusLabel = STATUS_LABELS[previousStatus] || previousStatus;
  const nextStatusLabel = STATUS_LABELS[updated.status] || updated.status;
  void notifyOrderLifecycle({
    type,
    order: updated,
    message: `Status alterado de "${previousStatusLabel}" para "${nextStatusLabel}".`
  }).catch((error) => {
    console.error('notifyOrderLifecycle(status_changed) failed', {
      orderId: updated.id,
      status: updated.status,
      error: error?.message || String(error)
    });
  });

  return res.json(toPublicOrder(updated));
}));

router.delete('/intake/:id', asyncHandler(async (req, res) => {
  const deleted = await deleteIntakeRecord(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'order_not_found' });
  return res.status(204).send();
}));

router.get('/intake/:id/tracking', asyncHandler(async (req, res) => {
  const parsed = trackingSchema.safeParse({ code: req.query.code });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const order = await findIntakeByReference(req.params.id);
  if (!order) return res.status(404).json({ error: 'tracking_not_found' });

  if (!trackingMatches(order, parsed.data.code)) {
    return res.status(404).json({ error: 'tracking_not_found' });
  }

  return res.json(toPublicOrder(order));
}));

router.get('/', requireUserJWT, asyncHandler(async (req, res) => {
  const scopedOrders = await listScopedOrders(req.user);
  return res.json(scopedOrders);
}));

router.post('/', requireUserJWT, requireRole(['client', 'admin']), asyncHandler(async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const now = new Date().toISOString();
  const data = parsed.data;

  const order = {
    id: uuidv4(),
    userId: req.user.sub,
    requestIp: getRequesterIp(req),
    title: sanitizeText(data.title),
    description: sanitizeText(data.description),
    priority: data.priority,
    status: 'new',
    dueDate: data.dueDate || null,
    statusHistory: [],
    createdAt: now,
    updatedAt: now
  };

  await createApiOrderRecord(order);

  return res.status(201).json(order);
}));

router.put('/:id', requireUserJWT, requireRole(['client', 'admin']), asyncHandler(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await findOrderById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'order_not_found' });

  const canEdit = req.user.role === 'admin' || existing.userId === req.user.sub;
  if (!canEdit) return res.status(403).json({ error: 'forbidden' });

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

  await updateApiOrderRecord(updated);
  return res.json(updated);
}));

router.delete('/:id', requireUserJWT, requireRole(['admin']), asyncHandler(async (req, res) => {
  const deleted = await deleteOrderRecord(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'order_not_found' });
  return res.status(204).send();
}));

export { router as ordersRouter };
