'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n/I18nProvider';

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function TrackingClient({ initialId }) {
  const { t } = useI18n();
  const [orderReference, setOrderReference] = useState(initialId || '');
  const [trackingCode, setTrackingCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await apiFetch(`/orders/intake/${encodeURIComponent(orderReference)}/tracking?code=${encodeURIComponent(trackingCode)}`);
      setResult(data);
    } catch {
      setError(t('tracking.lookupError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="form-shell">
      <div className="form-intro">
        <h1>{t('tracking.title')}</h1>
        <p>{t('tracking.subtitle')}</p>
      </div>

      <form className="request-form" onSubmit={onSubmit}>
        <label className="field">
          <span>{t('tracking.orderId')}</span>
          <input
            value={orderReference}
            onChange={(e) => setOrderReference(e.target.value)}
            placeholder="VRM-000001 ou UUID"
            required
          />
        </label>

        <label className="field">
          <span>{t('tracking.code')}</span>
          <input
            value={trackingCode}
            onChange={(e) => setTrackingCode(e.target.value)}
            placeholder="Código de rastreio (20 caracteres)"
            required
          />
        </label>

        <button className="submit-btn" type="submit" disabled={loading}>
          {loading ? t('tracking.loading') : t('tracking.submit')}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <article className="tracking-result">
          <h2>{t('tracking.detailsTitle')}</h2>
          <p><strong>{t('tracking.orderNumber')}:</strong> {result.orderNumber || result.id}</p>
          <p><strong>{t('tracking.technicalId')}:</strong> {result.id}</p>
          <p><strong>{t('tracking.currentStatus')}:</strong> {result.status}</p>
          <p><strong>{t('tracking.submittedAt')}:</strong> {formatDateTime(result.submittedAt || result.createdAt)}</p>
          <p><strong>{t('tracking.updatedAt')}:</strong> {formatDateTime(result.updatedAt)}</p>
          <p><strong>{t('tracking.priority')}:</strong> {result.priority}</p>
          <p><strong>{t('tracking.oneDriveFolder')}:</strong> {result.oneDriveFolder}</p>
          <p><strong>{t('tracking.totalFilesInFolder')}:</strong> {result.totalFilesInFolder ?? '-'}</p>

          <h3>{t('tracking.timelineTitle')}</h3>
          <div className="timeline">
            {(result.statusHistory || []).map((item) => (
              <div className="timeline-item" key={item.id || `${item.status}-${item.changedAt}`}>
                <strong>{item.label || item.status}</strong>
                <small>{formatDateTime(item.changedAt)}</small>
                {item.note && <span>{item.note}</span>}
              </div>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}
