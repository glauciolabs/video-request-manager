function readDocumentConfig() {
  if (typeof document === 'undefined') return {};

  const root = document.getElementById('vrm-admin-runtime-config');
  const { dataset } = root || {};
  if (!dataset) return {};

  return {
    authMode: dataset.vrmAuthMode || '',
    entraTenantId: dataset.vrmEntraTenantId || '',
    entraClientId: dataset.vrmEntraClientId || '',
    entraScope: dataset.vrmEntraScope || '',
    apiBaseUrl: dataset.vrmApiBaseUrl || '',
    turnstileEnabled: dataset.vrmTurnstileEnabled || '',
    turnstileSiteKey: dataset.vrmTurnstileSiteKey || ''
  };
}

function asBool(value) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
}

export function getRuntimeConfig() {
  const clientConfig = readDocumentConfig();

  return {
    authMode: clientConfig.authMode || process.env.NEXT_PUBLIC_AUTH_MODE || 'none',
    entraTenantId: clientConfig.entraTenantId
      || process.env.NEXT_PUBLIC_ENTRA_TENANT_ID
      || process.env.NEXT_PUBLIC_AZURE_TENANT_ID
      || '',
    entraClientId: clientConfig.entraClientId
      || process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID
      || process.env.NEXT_PUBLIC_AZURE_CLIENT_ID
      || '',
    entraScope: clientConfig.entraScope
      || process.env.NEXT_PUBLIC_ENTRA_SCOPE
      || process.env.NEXT_PUBLIC_AZURE_SCOPE
      || '',
    apiBaseUrl: clientConfig.apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || '',
    turnstileEnabled: asBool(
      clientConfig.turnstileEnabled
      || process.env.NEXT_PUBLIC_TURNSTILE_ENABLED
      || process.env.TURNSTILE_ENABLED
      || 'false'
    ),
    turnstileSiteKey: clientConfig.turnstileSiteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''
  };
}
