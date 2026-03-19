'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/api';

const statusOptions = ['awaiting_payment', 'new', 'triage', 'in_production', 'processing', 'done', 'cancelled'];
const priorityOptions = ['normal', 'fast', 'urgent', 'weekend'];

const statusLabels = {
  awaiting_payment: 'Aguardando pagamento',
  new: 'Novo',
  triage: 'Triagem',
  in_production: 'Em produção',
  processing: 'Processando',
  done: 'Concluído',
  cancelled: 'Cancelado'
};

const priorityLabels = {
  normal: 'Normal',
  fast: 'Rápido',
  urgent: 'Urgente',
  weekend: 'Final de semana'
};

const requestTypeLabels = {
  new_video: 'Novo vídeo',
  add_photos: 'Adicionar fotos e vídeos (pedido já processado)'
};

const transitionLabels = {
  default_3s: 'Não alterar (3s)',
  '4s': '4s',
  '5s': '5s',
  '6s': '6s',
  custom: 'Observações'
};
const prioritySlaHours = {
  normal: 120,
  fast: 72,
  urgent: 12,
  weekend: 30
};

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatRemaining(ms) {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getDeadlineInfo(order, nowMs = Date.now()) {
  const slaHours = prioritySlaHours[order.priority];
  const createdAt = new Date(order.submittedAt || order.createdAt);
  if (!slaHours || Number.isNaN(createdAt.getTime())) {
    return {
      dueAtLabel: '-',
      badge: { kind: 'pending', label: 'Sem SLA definido' }
    };
  }

  const dueAt = new Date(createdAt.getTime() + (slaHours * 3600000));
  const remainingMs = dueAt.getTime() - nowMs;
  const totalMs = slaHours * 3600000;
  const pctRemaining = remainingMs / totalMs;

  if (order.status === 'done') {
    const finishedAt = new Date(order.updatedAt || order.createdAt);
    const finishedLate = !Number.isNaN(finishedAt.getTime()) && finishedAt.getTime() > dueAt.getTime();
    return {
      dueAtLabel: formatDateTime(dueAt.toISOString()),
      badge: finishedLate
        ? { kind: 'overdue', label: 'Concluído com atraso' }
        : { kind: 'ok', label: 'Concluído no prazo' }
    };
  }

  if (order.status === 'cancelled') {
    return {
      dueAtLabel: formatDateTime(dueAt.toISOString()),
      badge: { kind: 'pending', label: 'Cancelado' }
    };
  }

  if (remainingMs <= 0) {
    return {
      dueAtLabel: formatDateTime(dueAt.toISOString()),
      badge: { kind: 'overdue', label: `Atrasado (${formatRemaining(Math.abs(remainingMs))})` }
    };
  }

  if (pctRemaining <= 0.2) {
    return {
      dueAtLabel: formatDateTime(dueAt.toISOString()),
      badge: { kind: 'danger', label: `Crítico (${formatRemaining(remainingMs)})` }
    };
  }

  if (pctRemaining <= 0.5) {
    return {
      dueAtLabel: formatDateTime(dueAt.toISOString()),
      badge: { kind: 'warning', label: `Atenção (${formatRemaining(remainingMs)})` }
    };
  }

  return {
    dueAtLabel: formatDateTime(dueAt.toISOString()),
    badge: { kind: 'ok', label: `No prazo (${formatRemaining(remainingMs)})` }
  };
}

function mapNotificationStatus(notification) {
  if (!notification) {
    return { label: 'Não enviado', kind: 'pending', detail: '' };
  }

  const delivery = notification.delivery || {};
  if (delivery.ok) {
    return { label: 'Entregue', kind: 'ok', detail: notification.type || '' };
  }

  const reason = delivery.reason
    || delivery.error
    || delivery.data?.description
    || (delivery.data?.error_code ? `erro_${delivery.data.error_code}` : '')
    || 'erro_desconhecido';
  return { label: 'Falhou', kind: 'fail', detail: reason };
}

function getAssetsChecklistLabel(order) {
  if (!order?.assetsReadyConfirmed) return 'Não confirmado';
  return order.requestType === 'add_photos'
    ? 'Confirmado (adição + vídeo processado anterior)'
    : 'Confirmado (novo pedido)';
}

function buildNotificationIndex(notifications) {
  const grouped = new Map();

  const isNewer = (a, b) => !a || String(a.createdAt) < String(b.createdAt);

  for (const item of notifications || []) {
    if (!item?.orderId) continue;
    if (!grouped.has(item.orderId)) {
      grouped.set(item.orderId, {
        telegramAdmin: null,
        telegramAny: null,
        emailClient: null,
        emailAny: null
      });
    }

    const current = grouped.get(item.orderId);
    if (!['telegram', 'email'].includes(item.channel)) continue;
    const role = item.recipientRole || '';

    if (item.channel === 'telegram') {
      if (isNewer(current.telegramAny, item)) current.telegramAny = item;
      if (role === 'admin' && isNewer(current.telegramAdmin, item)) current.telegramAdmin = item;
      continue;
    }

    if (isNewer(current.emailAny, item)) current.emailAny = item;
    if (role === 'client' && isNewer(current.emailClient, item)) current.emailClient = item;
  }

  const normalized = new Map();
  for (const [orderId, item] of grouped.entries()) {
    normalized.set(orderId, {
      telegram: item.telegramAdmin || item.telegramAny,
      email: item.emailClient || item.emailAny
    });
  }

  return normalized;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [notificationIndex, setNotificationIndex] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: 'all', priority: 'all', search: '' });
  const [nowMs, setNowMs] = useState(Date.now());

  const loadOrders = async (activeFilters = filters) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeFilters.status !== 'all') params.set('status', activeFilters.status);
      if (activeFilters.priority !== 'all') params.set('priority', activeFilters.priority);
      const query = params.toString();
      const [ordersData, notificationsData] = await Promise.all([
        fetchJson(`/orders/intake${query ? `?${query}` : ''}`),
        fetchJson('/notifications')
      ]);
      setOrders(ordersData);
      setNotificationIndex(buildNotificationIndex(notificationsData));
      setError('');
    } catch (cause) {
      const detail = cause?.message && !String(cause.message).startsWith('API ')
        ? ` (${cause.message})`
        : '';
      setError(`Não foi possível carregar pedidos.${detail}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const updateStatus = async (orderId, status) => {
    try {
      await fetchJson(`/orders/intake/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      await loadOrders(filters);
    } catch {
      setError('Falha ao atualizar status.');
    }
  };

  const deleteOrder = async (order) => {
    const ref = order.orderNumber || order.id;
    const confirmed = window.confirm(
      `Excluir permanentemente o pedido ${ref}? Essa ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setDeletingId(order.id);
    try {
      await fetchJson(`/orders/intake/${order.id}`, { method: 'DELETE' });
      await loadOrders(filters);
    } catch (cause) {
      const detail = cause?.message && !String(cause.message).startsWith('API ')
        ? ` (${cause.message})`
        : '';
      setError(`Falha ao excluir pedido.${detail}`);
    } finally {
      setDeletingId('');
    }
  };

  const filteredBySearch = orders.filter((order) => {
    const query = filters.search.trim().toLowerCase();
    if (!query) return true;

    const fields = [
      order.orderNumber,
      order.id,
      order.requesterName,
      order.requesterEmail,
      order.requestIp
    ];

    return fields.some((value) => String(value || '').toLowerCase().includes(query));
  });

  const localSummary = filteredBySearch.reduce((acc, item) => {
    acc.total += 1;
    if (item.status === 'awaiting_payment' || item.status === 'new' || item.status === 'triage') acc.pending += 1;
    if (item.status === 'in_production' || item.status === 'processing') acc.processing += 1;
    if (item.status === 'done') acc.done += 1;
    return acc;
  }, { total: 0, pending: 0, processing: 0, done: 0 });

  return (
    <section className="panel">
      <h1>Pedidos</h1>
      <p className="muted">Pedidos recebidos do formulário do cliente, com filtros por status e prioridade.</p>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Carregando...</p>}
      <div className="filters">
        <label className="search-field">
          <span>Busca rápida</span>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Pedido #, ID, nome ou e-mail"
          />
        </label>
        <label>
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="all">Todos</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status] || status}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Prioridade</span>
          <select
            value={filters.priority}
            onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
          >
            <option value="all">Todas</option>
            {priorityOptions.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority] || priority}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => loadOrders(filters)}>
          Aplicar filtros
        </button>
      </div>
      <div className="chips summary-chips">
        <span className="chip">Listados: {localSummary.total}</span>
        <span className="chip">Pendentes: {localSummary.pending}</span>
        <span className="chip">Em processamento: {localSummary.processing}</span>
        <span className="chip">Concluídos: {localSummary.done}</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Pedido #</th>
              <th>ID</th>
              <th>Solicitante</th>
              <th>IP solicitante</th>
              <th>Tipo</th>
              <th>Checklist arquivos</th>
              <th>Enviado em</th>
              <th>Transição</th>
              <th>Observações</th>
              <th>Prioridade</th>
              <th>Encerramento do prazo</th>
              <th>Status</th>
              <th>Telegram</th>
              <th>E-mail</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {filteredBySearch.map((order) => (
              <tr key={order.id}>
                <td>{order.orderNumber || '-'}</td>
                <td>{order.id}</td>
                <td>
                  <div>{order.requesterName}</div>
                  <small className="muted">{order.requesterEmail}</small>
                </td>
                <td className="ip-cell">
                  <div className="break-text">{order.requestIp || '-'}</div>
                </td>
                <td>{requestTypeLabels[order.requestType] || order.requestType}</td>
                <td>{getAssetsChecklistLabel(order)}</td>
                <td>{formatDateTime(order.submittedAt || order.createdAt)}</td>
                <td>{transitionLabels[order.transition] || order.transition}</td>
                <td className="obs-cell">
                  <div className="obs-content" title={order.observations || ''}>
                    {order.observations || '-'}
                  </div>
                </td>
                <td>{priorityLabels[order.priority] || order.priority}</td>
                <td>
                  {(() => {
                    const deadline = getDeadlineInfo(order, nowMs);
                    return (
                      <div className="sla-cell">
                        <span>{deadline.dueAtLabel}</span>
                        <span className={`sla-badge ${deadline.badge.kind}`}>{deadline.badge.label}</span>
                      </div>
                    );
                  })()}
                </td>
                <td>{statusLabels[order.status] || order.status}</td>
                <td>
                  {(() => {
                    const status = mapNotificationStatus(notificationIndex.get(order.id)?.telegram);
                    return (
                      <div className={`notify-badge ${status.kind}`}>
                        <strong>{status.label}</strong>
                        {status.detail && <small>{status.detail}</small>}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  {(() => {
                    const status = mapNotificationStatus(notificationIndex.get(order.id)?.email);
                    return (
                      <div className={`notify-badge ${status.kind}`}>
                        <strong>{status.label}</strong>
                        {status.detail && <small>{status.detail}</small>}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  <div className="status-actions">
                    <select
                      value={order.status}
                      onChange={(e) => updateStatus(order.id, e.target.value)}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status] || status}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => deleteOrder(order)}
                      disabled={deletingId === order.id}
                    >
                      {deletingId === order.id ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredBySearch.length === 0 && (
              <tr>
                <td colSpan={16} className="muted">Nenhum pedido encontrado com os filtros atuais.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
