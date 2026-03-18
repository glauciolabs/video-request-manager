import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { sendTelegramMessage } from '../lib/telegram.js';
import { sendEmailMessage } from '../lib/email.js';

const router = Router();

const notifications = [];

const schema = z.object({
  type: z.enum(['new_order', 'near_due', 'overdue', 'completed', 'status_changed']),
  channel: z.enum(['telegram', 'email']).default('telegram'),
  recipient: z.string().min(1),
  recipientRole: z.enum(['admin', 'client', 'system']).optional(),
  orderId: z.string().optional(),
  subject: z.string().min(3).max(180).optional(),
  message: z.string().min(1),
  html: z.string().min(1).optional()
});

function getEmailSubject(payload) {
  const subjectByType = {
    new_order: 'Confirmação do pedido de vídeo',
    near_due: 'Pedido próximo do prazo',
    overdue: 'Pedido em atraso',
    completed: 'Pedido concluído',
    status_changed: 'Atualização de status do pedido'
  };

  const base = subjectByType[payload.type] || 'Atualização do pedido';
  return payload.orderId ? `${base} #${payload.orderId}` : base;
}

router.post('/send', async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const payload = parsed.data;

  let delivery = { ok: true, simulated: true };
  try {
    if (payload.channel === 'telegram') {
      delivery = await sendTelegramMessage({
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: payload.recipient || process.env.TELEGRAM_DEFAULT_CHAT_ID,
        text: payload.message
      });
    } else if (payload.channel === 'email') {
      delivery = await sendEmailMessage({
        to: payload.recipient,
        subject: payload.subject || getEmailSubject(payload),
        text: payload.message,
        html: payload.html
      });
    }
  } catch {
    // Defensive fallback to avoid process crash if integrations throw unexpectedly.
    delivery = { ok: false, reason: 'notification_unhandled_error' };
  }

  // Email path is left as placeholder for SMTP/provider integration.

  const record = {
    id: uuidv4(),
    ...payload,
    delivery,
    createdAt: new Date().toISOString()
  };

  notifications.push(record);
  return res.status(201).json(record);
});

router.get('/', (req, res) => {
  return res.json(notifications);
});

export { router as notificationsRouter };
