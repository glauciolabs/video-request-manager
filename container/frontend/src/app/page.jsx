'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { apiFetch } from '@/lib/api';

const transitionOptions = ['default_3s', '4s', '5s', '6s', 'custom'];
const priorityOptions = [
  { value: 'normal', labelKey: 'form.priorityNormal' },
  { value: 'fast', labelKey: 'form.priorityFast' },
  { value: 'urgent', labelKey: 'form.priorityUrgent' },
  { value: 'weekend', labelKey: 'form.priorityWeekend' }
];
const NAME_INPUT_PATTERN = "^[A-Za-zÀ-ÖØ-öø-ÿ' .-]{2,120}$";
const EMAIL_INPUT_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$';
const ONEDRIVE_FOLDER_PATTERN = '^[A-Za-z0-9._-]{3,160}$';

export default function HomePage() {
  const { t } = useI18n();
  const [isWeekendByDevice, setIsWeekendByDevice] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [copiedField, setCopiedField] = useState('');
  const [form, setForm] = useState({
    requesterName: '',
    requesterEmail: '',
    requestType: 'new_video',
    oneDriveFolder: '',
    totalFilesInFolder: '',
    transition: 'default_3s',
    priority: 'normal',
    observations: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    const weekday = new Date().getDay();
    setIsWeekendByDevice(weekday === 0 || weekday === 6);
  }, []);

  useEffect(() => {
    if (!isWeekendByDevice) return;
    setForm((prev) => (prev.priority === 'weekend' ? prev : { ...prev, priority: 'weekend' }));
  }, [isWeekendByDevice]);

  const onCopy = async (value, field) => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 1400);
    } catch {
      // Clipboard may be blocked in some browser contexts.
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload = {
        ...form,
        totalFilesInFolder: Number(form.totalFilesInFolder),
        priority: isWeekendByDevice ? 'weekend' : form.priority
      };

      const result = await apiFetch('/orders/intake', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setSubmitted({
        orderNumber: result.orderNumber || result.id,
        id: result.id,
        trackingCode: result.trackingCode,
        submittedAt: result.submittedAt || result.createdAt
      });
      setFeedback({ type: 'ok', text: t('form.success') });
      setForm({
        requesterName: '',
        requesterEmail: '',
        requestType: 'new_video',
        oneDriveFolder: '',
        totalFilesInFolder: '',
        transition: 'default_3s',
        priority: isWeekendByDevice ? 'weekend' : 'normal',
        observations: ''
      });
    } catch (error) {
      if (error?.status === 409 && error?.payload?.error === 'one_drive_folder_already_exists') {
        setFeedback({ type: 'error', text: t('form.oneDriveUniqueError') });
      } else {
        setFeedback({ type: 'error', text: t('form.error') });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="form-shell">
      <div className="form-intro">
        <h1>{t('form.title')}</h1>
        <p>{t('form.subtitle')}</p>
      </div>
      {feedback && <p className={`form-feedback ${feedback.type}`}>{feedback.text}</p>}

      {submitted && (
        <article className="tracking-result">
          <h2>{t('tracking.afterSubmitTitle')}</h2>
          <p className="hint">{t('tracking.afterSubmitHint')}</p>
          <div className="tracking-code-grid">
            <div className="code-row">
              <span>{t('tracking.orderNumber')}</span>
              <code>{submitted.orderNumber}</code>
              <button type="button" className="ghost-btn" onClick={() => onCopy(submitted.orderNumber, 'order')}>
                {copiedField === 'order' ? t('common.copied') : t('common.copy')}
              </button>
            </div>
            <div className="code-row">
              <span>{t('tracking.technicalId')}</span>
              <code>{submitted.id}</code>
              <button type="button" className="ghost-btn" onClick={() => onCopy(submitted.id, 'id')}>
                {copiedField === 'id' ? t('common.copied') : t('common.copy')}
              </button>
            </div>
            <div className="code-row">
              <span>{t('tracking.code')}</span>
              <code>{submitted.trackingCode}</code>
              <button type="button" className="ghost-btn" onClick={() => onCopy(submitted.trackingCode, 'tracking')}>
                {copiedField === 'tracking' ? t('common.copied') : t('common.copy')}
              </button>
            </div>
          </div>
          <p><strong>{t('tracking.submittedAt')}:</strong> {new Date(submitted.submittedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
          <a className="tracking-open-link" href={`/tracking?id=${encodeURIComponent(submitted.orderNumber)}`}>{t('tracking.openPage')}</a>
        </article>
      )}

      <form className="request-form" onSubmit={onSubmit}>
        <div className="grid-2">
          <label className="field">
            <span>{t('form.requesterName')}</span>
            <input
              autoFocus
              required
              autoComplete="name"
              maxLength={120}
              pattern={NAME_INPUT_PATTERN}
              title={t('form.requesterNamePatternHelp')}
              value={form.requesterName}
              onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
              placeholder={t('form.requesterNamePlaceholder')}
            />
          </label>

          <label className="field">
            <span>{t('form.requesterEmail')}</span>
            <input
              type="email"
              required
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              pattern={EMAIL_INPUT_PATTERN}
              title={t('form.requesterEmailPatternHelp')}
              value={form.requesterEmail}
              onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })}
              placeholder={t('form.requesterEmailPlaceholder')}
            />
          </label>
        </div>

        <fieldset className="field radio-group">
          <legend>{t('form.requestType')}</legend>
          <p className="hint">{t('form.requestTypeHint')}</p>
          <label>
            <input
              type="radio"
              name="requestType"
              value="new_video"
              checked={form.requestType === 'new_video'}
              onChange={(e) => setForm({
                ...form,
                requestType: e.target.value
              })}
              required
            />
            {t('form.requestTypeNew')}
          </label>
          <label>
            <input
              type="radio"
              name="requestType"
              value="add_photos"
              checked={form.requestType === 'add_photos'}
              onChange={(e) => setForm({ ...form, requestType: e.target.value })}
              required
            />
            {t('form.requestTypeAdd')}
          </label>
        </fieldset>

        <label className="field">
          <span>{t('form.oneDriveFolder')}</span>
          <p className="hint">{t('form.oneDriveHint')}</p>
          <input
            required
            maxLength={160}
            pattern={ONEDRIVE_FOLDER_PATTERN}
            title={t('form.oneDrivePatternHelp')}
            value={form.oneDriveFolder}
            onChange={(e) => setForm({ ...form, oneDriveFolder: e.target.value })}
            placeholder="colecao-donna-verao-19-02-2026"
          />
        </label>

        <label className="field">
          <span>{t('form.totalFilesInFolder')}</span>
          <p className="hint">{t('form.totalFilesInFolderHint')}</p>
          <input
            type="number"
            min={1}
            step={1}
            required
            value={form.totalFilesInFolder}
            onChange={(e) => setForm({ ...form, totalFilesInFolder: e.target.value })}
            placeholder="120"
          />
        </label>

        <fieldset className="field radio-group">
          <legend>{t('form.transition')}</legend>
          <p className="hint">{t('form.transitionHint')}</p>
          {transitionOptions.map((item) => (
            <label key={item}>
              <input
                type="radio"
                name="transition"
                value={item}
                checked={form.transition === item}
                onChange={(e) => setForm({ ...form, transition: e.target.value })}
                required
              />
              {item === 'default_3s'
                ? t('form.transitionDefault')
                : item === 'custom'
                  ? t('form.transitionCustom')
                  : item.replace('s', ` ${t('form.seconds')}`)}
            </label>
          ))}
        </fieldset>

        <fieldset className="field radio-group">
          <legend>{t('form.priority')}</legend>
          <p className="hint">{t('form.priorityHint')}</p>
          <p className="warning">{t('form.weekendWarning')}</p>
          {isWeekendByDevice && <p className="warning">{t('form.weekendLockActive')}</p>}
          {priorityOptions.map((option) => {
            const isDisabled = isWeekendByDevice && option.value !== 'weekend';
            return (
              <label key={option.value}>
                <input
                  type="radio"
                  name="priority"
                  value={option.value}
                  checked={form.priority === option.value}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  required
                  disabled={isDisabled}
                />
                {t(option.labelKey)}
              </label>
            );
          })}
        </fieldset>

        <label className="field">
          <span>{t('form.observations')}</span>
          <p className="hint">{t('form.observationsHint')}</p>
          <textarea
            rows={5}
            value={form.observations}
            onChange={(e) => setForm({ ...form, observations: e.target.value })}
          />
        </label>

        <button className="submit-btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('form.sending') : t('form.submit')}
        </button>
      </form>
    </section>
  );
}
