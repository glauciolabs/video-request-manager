'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/api';

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

const transitionLabels = {
  default_3s: 'Não alterar (3s)',
  '4s': '4 segundos',
  '5s': '5 segundos',
  '6s': '6 segundos',
  custom: 'Definido em observações'
};

export default function AdminReportsPage() {
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchJson('/orders/intake/summary')
      .then((summary) => {
        setGroups([
          {
            title: 'Status',
            items: Object.entries(summary.byStatus || {}).map(([key, value]) => ({
              label: statusLabels[key] || key,
              value
            }))
          },
          {
            title: 'Prioridade',
            items: Object.entries(summary.byPriority || {}).map(([key, value]) => ({
              label: priorityLabels[key] || key,
              value
            }))
          },
          {
            title: 'Tipo de solicitação',
            items: Object.entries(summary.byRequestType || {}).map(([key, value]) => ({
              label: key === 'new_video' ? 'Novo vídeo' : 'Adicionar fotos e vídeos (pedido já processado)',
              value
            }))
          },
          {
            title: 'Tempo de transição',
            items: Object.entries(summary.byTransition || {}).map(([key, value]) => ({
              label: transitionLabels[key] || key,
              value
            }))
          }
        ]);
      })
      .catch(() => setError('Não foi possível carregar relatórios.'));
  }, []);

  return (
    <section className="panel">
      <h1>Relatórios</h1>
      <p className="muted">Visão consolidada dos campos do formulário.</p>
      {error && <p className="error">{error}</p>}
      <div className="report-groups">
        {groups.map((group) => {
          const max = Math.max(...group.items.map((item) => item.value), 1);
          return (
            <article className="report-group" key={group.title}>
              <h2>{group.title}</h2>
              <div className="bars">
                {group.items.map((item) => (
                  <div className="bar" key={`${group.title}:${item.label}`}>
                    <span>{item.label}</span>
                    <div className="track">
                      <div className="fill" style={{ width: `${(item.value / max) * 100}%` }} />
                    </div>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
