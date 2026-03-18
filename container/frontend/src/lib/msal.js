export async function loginWithMsalIfEnabled() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_MSAL === 'true';

  // Keep local auth as default fallback when MSAL is not configured.
  if (!enabled) {
    alert('MSAL desabilitado. Use login local.');
    return;
  }

  // Placeholder to integrate @azure/msal-browser in future.
  alert('TODO: integrar login Microsoft Entra ID (MSAL).');
}
