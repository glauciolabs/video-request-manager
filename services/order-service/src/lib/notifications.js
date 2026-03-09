import jwt from 'jsonwebtoken';

const SERVICE_JWT_SECRET = process.env.SERVICE_JWT_SECRET || 'change-me-too';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3003/notifications';
const TRACKING_BASE_URL = process.env.TRACKING_BASE_URL || 'http://localhost:3000/tracking';
const REQUEST_TYPE_LABELS = {
  new_video: 'Criar novo vídeo',
  add_photos: 'Adicionar fotos e vídeos a um pedido já processado'
};
const PRIORITY_LABELS = {
  normal: 'Normal',
  fast: 'Rápido',
  urgent: 'Urgente',
  weekend: 'Final de semana'
};
const STATUS_LABELS = {
  new: 'Novo',
  triage: 'Triagem',
  in_production: 'Em produção',
  processing: 'Processando',
  done: 'Concluído',
  cancelled: 'Cancelado'
};
const TRANSITION_LABELS = {
  default_3s: 'Padrão (3 segundos)',
  '4s': '4 segundos',
  '5s': '5 segundos',
  '6s': '6 segundos',
  custom: 'Definido nas observações'
};

function createServiceToken() {
  return jwt.sign({ service: 'order-service' }, SERVICE_JWT_SECRET, { expiresIn: '5m' });
}

async function sendNotification(payload) {
  const token = createServiceToken();

  const response = await fetch(`${NOTIFICATION_SERVICE_URL}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-token': token
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`notification service returned ${response.status}`);
  }
}

function formatDate(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function getNotificationTitle(type) {
  const byType = {
    new_order: 'Confirmação de recebimento do pedido',
    near_due: 'Pedido próximo do prazo',
    overdue: 'Pedido em atraso',
    completed: 'Pedido concluído',
    status_changed: 'Atualização de status do pedido'
  };

  return byType[type] || 'Atualização do pedido';
}

function getCustomerNotificationIntro(type, order) {
  const requester = order.requesterName || 'cliente';
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  const byType = {
    new_order: `Olá, ${requester}. Seu pedido foi recebido com sucesso e está em análise inicial.`,
    near_due: `Olá, ${requester}. Seu pedido está próximo do prazo previsto.`,
    overdue: `Olá, ${requester}. Seu pedido ultrapassou o prazo estimado e está sendo priorizado.`,
    completed: `Olá, ${requester}. Seu pedido foi concluído com sucesso.`,
    status_changed: `Olá, ${requester}. O status do seu pedido foi atualizado para "${statusLabel}".`
  };

  return byType[type] || `Olá, ${requester}. Houve uma atualização no seu pedido.`;
}

function getAdminNotificationIntro(type, order) {
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  const byType = {
    new_order: 'Novo pedido recebido para triagem da equipe administrativa.',
    near_due: 'Atenção: pedido próximo do prazo estimado.',
    overdue: 'Atenção: pedido em atraso em relação ao prazo estimado.',
    completed: 'Pedido marcado como concluído.',
    status_changed: `Atualização administrativa: status atual "${statusLabel}".`
  };

  return byType[type] || 'Atualização de pedido para a equipe administrativa.';
}

const PRIORITY_SLA = {
  normal: { hours: 120, label: '3 a 5 dias úteis (estimado)' },
  fast: { hours: 72, label: '2 a 3 dias úteis (estimado)' },
  urgent: { hours: 12, label: 'até 12 horas' },
  weekend: { hours: 30, label: 'até 30 horas' }
};

function getSlaSummary(order) {
  const rule = PRIORITY_SLA[order.priority] || null;
  if (!rule) {
    return { slaLabel: '-', estimatedDeadline: '-' };
  }

  const created = new Date(order.createdAt);
  if (Number.isNaN(created.getTime())) {
    return { slaLabel: rule.label, estimatedDeadline: '-' };
  }

  const due = new Date(created.getTime() + (rule.hours * 3600000));
  return {
    slaLabel: rule.label,
    estimatedDeadline: formatDate(due.toISOString())
  };
}

function buildOrderRows(order) {
  const { slaLabel, estimatedDeadline } = getSlaSummary(order);

  return [
    ['Pedido #', order.orderNumber || '-'],
    ['ID', order.id || '-'],
    ['Solicitante', order.requesterName || '-'],
    ['E-mail', order.requesterEmail || '-'],
    ['Tipo de solicitação', REQUEST_TYPE_LABELS[order.requestType] || order.requestType || '-'],
    ['Pasta OneDrive', order.oneDriveFolder || '-'],
    ['Total de arquivos na pasta', order.totalFilesInFolder || '-'],
    ['Transição', TRANSITION_LABELS[order.transition] || order.transition || '-'],
    ['Prioridade', PRIORITY_LABELS[order.priority] || order.priority || '-'],
    ['Prazo SLA da prioridade', slaLabel],
    ['Encerramento do prazo (dia/mês/horário)', estimatedDeadline],
    ['Status atual', STATUS_LABELS[order.status] || order.status || '-'],
    ['Data/hora do envio do formulário', formatDate(order.createdAt)],
    ['Atualizado em', formatDate(order.updatedAt)],
    ['Observações', order.observations || '-'],
    ['Código de rastreio', order.trackingCode || '-'],
    ['Acompanhamento', `${TRACKING_BASE_URL} (informar número do pedido/ID + código)`]
  ];
}

function buildTextBody(type, order, customMessage) {
  const rows = buildOrderRows(order);
  const lines = [
    getCustomerNotificationIntro(type, order),
    '',
    customMessage || '',
    customMessage ? '' : '',
    'Detalhes do pedido:',
    ...rows.map(([label, value]) => `- ${label}: ${value}`),
    '',
    'Equipe Video Request Manager'
  ];

  return lines.filter((line, idx) => {
    // Remove only duplicated blank lines.
    if (line !== '') return true;
    return idx > 0 && lines[idx - 1] !== '';
  }).join('\n');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildAdminTelegramBody(type, order, customMessage) {
  const rows = buildOrderRows(order);
  const lines = [
    `VRM Admin | ${getNotificationTitle(type)}`,
    getAdminNotificationIntro(type, order),
    '',
    customMessage || '',
    customMessage ? '' : '',
    'Resumo para operação:',
    ...rows.map(([label, value]) => `- ${label}: ${value}`),
    '',
    'Acompanhe também no painel administrativo.'
  ];

  return lines.filter((line, idx) => {
    if (line !== '') return true;
    return idx > 0 && lines[idx - 1] !== '';
  }).join('\n');
}

function buildHtmlBody(type, order, customMessage) {
  const intro = escapeHtml(getCustomerNotificationIntro(type, order));
  const headline = customMessage ? `<p style="margin:0 0 12px 0;">${escapeHtml(customMessage)}</p>` : '';
  const rows = buildOrderRows(order);

  const htmlRows = rows
    .map(([label, value]) => (
      `<tr>
        <td style="padding:8px;border:1px solid #d8e0ec;font-weight:600;background:#f8fbff;">${escapeHtml(label)}</td>
        <td style="padding:8px;border:1px solid #d8e0ec;">${escapeHtml(value)}</td>
      </tr>`
    ))
    .join('');

  return `<div style="font-family:Arial,sans-serif;color:#10243f;line-height:1.5;">
    <p style="margin:0 0 12px 0;">${intro}</p>
    ${headline}
    <table style="border-collapse:collapse;width:100%;max-width:760px;">
      ${htmlRows}
    </table>
    <p style="margin:12px 0 0 0;">Equipe Video Request Manager</p>
  </div>`;
}

function buildNotificationContent(type, order, customMessage) {
  const title = getNotificationTitle(type);
  const customerText = buildTextBody(type, order, customMessage);
  const reference = order.orderNumber || order.id;

  return {
    subject: `${title} #${reference}`,
    text: customerText,
    html: buildHtmlBody(type, order, customMessage),
    adminTelegramText: buildAdminTelegramBody(type, order, customMessage)
  };
}

export async function notifyOrderLifecycle({ type, order, message }) {
  const content = buildNotificationContent(type, order, message);
  const tasks = [];

  // Telegram recipient is a chat id. If empty, notification-service will use defaults.
  tasks.push(
    sendNotification({
      type,
      channel: 'telegram',
      recipient: process.env.TELEGRAM_DEFAULT_CHAT_ID || 'default-chat',
      orderId: order.id,
      recipientRole: 'admin',
      message: content.adminTelegramText
    })
  );

  if (order.requesterEmail) {
    tasks.push(
      sendNotification({
        type,
        channel: 'email',
        recipient: order.requesterEmail,
        orderId: order.id,
        recipientRole: 'client',
        subject: content.subject,
        message: content.text,
        html: content.html
      })
    );
  }

  await Promise.allSettled(tasks);
}
