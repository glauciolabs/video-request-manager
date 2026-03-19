'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/api';

const priorityLabels = {
  normal: 'Normal',
  fast: 'Rápido',
  urgent: 'Urgente',
  weekend: 'Final de semana'
};

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    processing: 0,
    done: 0,
    byStatus: {},
    byPriority: {},
    byRequestType: {}
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchJson('/orders/intake/summary')
      .then(setSummary)
      .catch((cause) => {
        const detail = cause?.message && !String(cause.message).startsWith('API ')
          ? ` (${cause.message})`
          : '';
        setError(`Não foi possível carregar métricas.${detail}`);
      });
  }, []);

  const cards = [
    { label: 'Total', value: summary.total || 0 },
    { label: 'Aguardando pagamento', value: summary.byStatus?.awaiting_payment || 0 },
    { label: 'Pendentes', value: summary.pending || 0 },
    { label: 'Em processamento', value: summary.processing || 0 },
    { label: 'Concluídos', value: summary.done || 0 },
    { label: 'Cancelados', value: summary.byStatus?.cancelled || 0 }
  ];

  return (
    <section className="panel">
      <h1>Dashboard administrativo</h1>
      <p className="muted">Indicadores do formulário e operação.</p>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {cards.map((card) => (
          <article className="card" key={card.label}>
            <h3>{card.label}</h3>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
      <div className="mini-grid">
        <article className="mini-card">
          <h3>Por prioridade</h3>
          <div className="chips">
            {Object.entries(summary.byPriority || {}).map(([key, value]) => (
              <span className="chip" key={key}>{priorityLabels[key] || key}: {value}</span>
            ))}
          </div>
        </article>
        <article className="mini-card">
          <h3>Por tipo de solicitação</h3>
          <div className="chips">
            <span className="chip">Novo vídeo: {summary.byRequestType?.new_video || 0}</span>
            <span className="chip">Adicionar fotos e vídeos: {summary.byRequestType?.add_photos || 0}</span>
          </div>
        </article>
      </div>
    </section>
  );
}
