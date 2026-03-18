'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { apiFetch } from '@/lib/api';
import { TurnstileWidget } from '@/components/TurnstileWidget';
import { getRuntimeConfig } from '@/lib/runtime-config';

const transitionOptions = ['default_3s', '4s', '5s', '6s', 'custom'];
const priorityOptions = [
  { value: 'normal', labelKey: 'form.priorityNormal' },
  { value: 'fast', labelKey: 'form.priorityFast' },
  { value: 'urgent', labelKey: 'form.priorityUrgent' },
  { value: 'weekend', labelKey: 'form.priorityWeekend' }
];
const NAME_INPUT_PATTERN = "^[A-Za-zÀ-ÖØ-öø-ÿ' .\\-]{2,120}$";
const EMAIL_INPUT_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$';
const FORM_ACCESS_STORAGE_KEY = 'vrm_form_access_token';

export default function HomePage() {
  const { t } = useI18n();
  const runtimeConfig = getRuntimeConfig();
  const turnstileEnabled = runtimeConfig.turnstileEnabled && Boolean(runtimeConfig.turnstileSiteKey);
  const formEntryEnabled = runtimeConfig.formEntryEnabled;

  const [isWeekendByDevice, setIsWeekendByDevice] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [copiedField, setCopiedField] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileRefreshKey, setTurnstileRefreshKey] = useState(0);
  const [entryPassword, setEntryPassword] = useState('');
  const [entryFeedback, setEntryFeedback] = useState(null);
  const [entryToken, setEntryToken] = useState('');
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [entryTurnstileToken, setEntryTurnstileToken] = useState('');
  const [entryTurnstileRefreshKey, setEntryTurnstileRefreshKey] = useState(0);
  const [form, setForm] = useState({
    requesterName: '',
    requesterEmail: '',
    requestType: 'new_video',
    assetsReadyConfirmed: false,
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

  useEffect(() => {
    if (typeof window === 'undefined' || !formEntryEnabled) return;
    const savedToken = String(sessionStorage.getItem(FORM_ACCESS_STORAGE_KEY) || '').trim();
    if (savedToken) {
      setEntryToken(savedToken);
    }
  }, [formEntryEnabled]);

  const onCopy = async (value, field) => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 1400);
    } catch {
      // Clipboard may be blocked in some browser contexts.
    }
  };

  const clearEntryToken = () => {
    setEntryToken('');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(FORM_ACCESS_STORAGE_KEY);
    }
  };

  const getSubmitErrorText = (error) => {
    if (error?.status === 400 && error?.payload?.error === 'turnstile_verification_failed') {
      return t('form.turnstileRequiredError');
    }

    if (error?.payload?.error === 'data_backend_unavailable') {
      return 'Serviço de dados temporariamente indisponível. Tente novamente em instantes.';
    }

    const fieldErrors = error?.payload?.error?.fieldErrors;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const firstFieldMessage = Object.values(fieldErrors).flat().find(Boolean);
      if (firstFieldMessage) return String(firstFieldMessage);
    }

    const formErrors = error?.payload?.error?.formErrors;
    if (Array.isArray(formErrors) && formErrors[0]) {
      return String(formErrors[0]);
    }

    if (error?.payload?.reason) return String(error.payload.reason);
    if (error?.payload?.error) return String(error.payload.error);
    if (error?.payload?.message) return String(error.payload.message);
    if (error?.message && !String(error.message).startsWith('API error')) return String(error.message);
    return t('form.error');
  };

  const onUnlockForm = async (event) => {
    event.preventDefault();
    if (!entryPassword.trim()) {
      setEntryFeedback({ type: 'error', text: t('form.entryErrorRequired') });
      return;
    }

    if (turnstileEnabled && !entryTurnstileToken) {
      setEntryFeedback({ type: 'error', text: t('form.turnstileRequiredError') });
      return;
    }

    setEntrySubmitting(true);
    setEntryFeedback(null);

    try {
      const result = await apiFetch('/orders/intake/access', {
        method: 'POST',
        body: JSON.stringify({
          password: entryPassword,
          turnstileToken: turnstileEnabled ? entryTurnstileToken : ''
        })
      });

      const token = String(result?.token || '').trim();
      if (!token) {
        setEntryFeedback({ type: 'error', text: t('form.entryError') });
        return;
      }

      setEntryToken(token);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(FORM_ACCESS_STORAGE_KEY, token);
      }
      setEntryPassword('');
      setEntryFeedback({ type: 'ok', text: t('form.entrySuccess') });
    } catch (error) {
      const apiError = String(error?.payload?.error || '');
      if (apiError === 'form_access_invalid_password') {
        setEntryFeedback({ type: 'error', text: t('form.entryErrorInvalid') });
      } else if (apiError === 'form_access_temporarily_blocked' || error?.status === 429) {
        setEntryFeedback({ type: 'error', text: t('form.entryErrorBlocked') });
      } else if (apiError === 'turnstile_verification_failed') {
        setEntryFeedback({ type: 'error', text: t('form.turnstileRequiredError') });
      } else {
        setEntryFeedback({ type: 'error', text: t('form.entryError') });
      }
    } finally {
      setEntrySubmitting(false);
      if (turnstileEnabled) {
        setEntryTurnstileToken('');
        setEntryTurnstileRefreshKey((prev) => prev + 1);
      }
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    if (formEntryEnabled && !entryToken) {
      setFeedback({ type: 'error', text: t('form.entryError') });
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setFeedback({ type: 'error', text: t('form.turnstileRequiredError') });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload = {
        ...form,
        priority: isWeekendByDevice ? 'weekend' : form.priority,
        turnstileToken: turnstileEnabled ? turnstileToken : ''
      };

      const result = await apiFetch('/orders/intake', {
        method: 'POST',
        headers: formEntryEnabled && entryToken ? { 'x-form-access-token': entryToken } : {},
        body: JSON.stringify(payload)
      });

      setSubmitted({
        orderNumber: result.orderNumber || result.id,
        id: result.id,
        trackingCode: result.trackingCode,
        status: result.status,
        submittedAt: result.submittedAt || result.createdAt
      });
      setFeedback({ type: 'ok', text: t('form.success') });
      setForm({
        requesterName: '',
        requesterEmail: '',
        requestType: 'new_video',
        assetsReadyConfirmed: false,
        transition: 'default_3s',
        priority: isWeekendByDevice ? 'weekend' : 'normal',
        observations: ''
      });
    } catch (error) {
      const accessError = String(error?.payload?.error || '');
      if (error?.status === 401 && accessError.startsWith('form_access_')) {
        clearEntryToken();
        setFeedback({ type: 'error', text: t('form.entryError') });
      } else {
        setFeedback({ type: 'error', text: getSubmitErrorText(error) });
      }
    } finally {
      setIsSubmitting(false);
      if (turnstileEnabled) {
        setTurnstileToken('');
        setTurnstileRefreshKey((prev) => prev + 1);
      }
    }
  };

  return (
    <section className="form-shell">
      <div className="form-intro">
        <h1>{t('form.title')}</h1>
        <p>{t('form.subtitle')}</p>
      </div>

      {formEntryEnabled && !entryToken && (
        <form className="request-form" onSubmit={onUnlockForm}>
          <div className="field">
            <span>{t('form.entryTitle')}</span>
            <p className="hint">{t('form.entrySubtitle')}</p>
          </div>

          {entryFeedback && <p className={`form-feedback ${entryFeedback.type}`}>{entryFeedback.text}</p>}

          <label className="field">
            <span>{t('form.entryPasswordLabel')}</span>
            <input
              type="password"
              autoFocus
              required
              value={entryPassword}
              onChange={(e) => setEntryPassword(e.target.value)}
              placeholder={t('form.entryPasswordPlaceholder')}
            />
          </label>

          {turnstileEnabled && (
            <div className="field turnstile-box">
              <span>{t('form.turnstileTitle')}</span>
              <p className="hint">{t('form.turnstileHint')}</p>
              <TurnstileWidget
                enabled={turnstileEnabled}
                siteKey={runtimeConfig.turnstileSiteKey}
                refreshKey={entryTurnstileRefreshKey}
                onTokenChange={setEntryTurnstileToken}
                onLoadError={() => setEntryFeedback({ type: 'error', text: t('form.turnstileLoadError') })}
              />
            </div>
          )}

          <button className="submit-btn" type="submit" disabled={entrySubmitting}>
            {entrySubmitting ? t('form.entryUnlocking') : t('form.entryUnlock')}
          </button>
        </form>
      )}

      {(!formEntryEnabled || entryToken) && (
        <>
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
              <p><strong>{t('tracking.currentStatus')}:</strong> {submitted.status || '-'}</p>
              {runtimeConfig.pixPaymentKey && (
                <div className="code-row">
                  <span>{t('form.pixKey')}</span>
                  <code>{runtimeConfig.pixPaymentKey}</code>
                  <button type="button" className="ghost-btn" onClick={() => onCopy(runtimeConfig.pixPaymentKey, 'pix')}>
                    {copiedField === 'pix' ? t('common.copied') : t('common.copy')}
                  </button>
                </div>
              )}
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
              <span>{t('form.assetsChecklist')}</span>
              <p className="hint">
                {form.requestType === 'new_video'
                  ? t('form.assetsChecklistHintNew')
                  : t('form.assetsChecklistHintAdd')}
              </p>
              <input
                type="checkbox"
                required
                checked={form.assetsReadyConfirmed}
                onChange={(e) => setForm({ ...form, assetsReadyConfirmed: e.target.checked })}
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

            {turnstileEnabled && (
              <div className="field turnstile-box">
                <span>{t('form.turnstileTitle')}</span>
                <p className="hint">{t('form.turnstileHint')}</p>
                <TurnstileWidget
                  enabled={turnstileEnabled}
                  siteKey={runtimeConfig.turnstileSiteKey}
                  refreshKey={turnstileRefreshKey}
                  onTokenChange={setTurnstileToken}
                  onLoadError={() => setFeedback({ type: 'error', text: t('form.turnstileLoadError') })}
                />
              </div>
            )}

            <button className="submit-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('form.sending') : t('form.submit')}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
