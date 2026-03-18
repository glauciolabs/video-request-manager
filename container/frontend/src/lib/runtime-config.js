function readDocumentConfig() {
  if (typeof document === 'undefined') return {};

  const root = document.getElementById('vrm-runtime-config');
  const { dataset } = root || {};
  if (!dataset) return {};

  return {
    turnstileEnabled: dataset.vrmTurnstileEnabled || '',
    turnstileSiteKey: dataset.vrmTurnstileSiteKey || '',
    pixPaymentKey: dataset.vrmPixPaymentKey || '',
    formEntryEnabled: dataset.vrmFormEntryEnabled || ''
  };
}

function asBool(value) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
}

export function getRuntimeConfig() {
  const clientConfig = readDocumentConfig();

  return {
    turnstileEnabled: asBool(
      clientConfig.turnstileEnabled || process.env.NEXT_PUBLIC_TURNSTILE_ENABLED || 'false'
    ),
    turnstileSiteKey: clientConfig.turnstileSiteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
    pixPaymentKey: clientConfig.pixPaymentKey || process.env.NEXT_PUBLIC_PIX_PAYMENT_KEY || '',
    formEntryEnabled: asBool(
      clientConfig.formEntryEnabled || process.env.NEXT_PUBLIC_FORM_ENTRY_ENABLED || 'false'
    )
  };
}
