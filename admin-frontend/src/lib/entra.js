'use client';

import { PublicClientApplication } from '@azure/msal-browser';
import { getRuntimeConfig } from '@/lib/runtime-config';

function getPublicConfig() {
  const runtimeConfig = getRuntimeConfig();
  const tenantId = runtimeConfig.entraTenantId || '';
  const clientId = runtimeConfig.entraClientId || '';
  const scope = runtimeConfig.entraScope || (clientId ? `api://${clientId}/access_as_user` : '');

  return {
    tenantId,
    clientId,
    scope,
    enabled: Boolean(tenantId && clientId)
  };
}

function getRedirectUri() {
  if (typeof window === 'undefined') return 'http://localhost:3006';
  return window.location.origin;
}

let msalInstance;

export function getEntraConfig() {
  return getPublicConfig();
}

function mapAccountToUser(account) {
  if (!account) return null;
  const claims = account.idTokenClaims || {};
  const name = claims.name || account.name || '';
  const email = claims.preferred_username || claims.email || claims.upn || account.username || '';
  const avatarUrl = claims.picture || '';
  if (!name && !email) return null;
  return { name, email, avatarUrl };
}

export async function getMsalInstance() {
  const config = getPublicConfig();
  if (!config.enabled) return null;

  if (!msalInstance) {
    msalInstance = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        redirectUri: getRedirectUri(),
        navigateToLoginRequestUrl: false
      },
      cache: {
        cacheLocation: 'localStorage'
      }
    });
  }

  if (typeof msalInstance.initialize === 'function') {
    await msalInstance.initialize();
  }

  return msalInstance;
}

async function acquireAccessToken(msal) {
  const config = getPublicConfig();
  const account = msal.getActiveAccount() || msal.getAllAccounts()[0];
  if (!account) return null;

  msal.setActiveAccount(account);

  try {
    const response = await msal.acquireTokenSilent({
      account,
      scopes: [config.scope]
    });

    return response?.accessToken || response?.idToken || account.idToken || null;
  } catch {
    await msal.acquireTokenRedirect({
      scopes: [config.scope]
    });
    return null;
  }
}

export async function bootstrapEntraSession() {
  const msal = await getMsalInstance();
  if (!msal) return null;

  const redirectResponse = await msal.handleRedirectPromise();
  if (redirectResponse?.account) {
    msal.setActiveAccount(redirectResponse.account);
    return redirectResponse.accessToken || redirectResponse.idToken || acquireAccessToken(msal);
  }

  const accounts = msal.getAllAccounts();
  if (!accounts.length) return null;

  msal.setActiveAccount(accounts[0]);
  return acquireAccessToken(msal);
}

export async function getCurrentEntraUser() {
  const msal = await getMsalInstance();
  if (!msal) return null;
  const account = msal.getActiveAccount() || msal.getAllAccounts()[0];
  if (!account) return null;
  msal.setActiveAccount(account);
  return mapAccountToUser(account);
}

export async function loginWithEntraRedirect() {
  const msal = await getMsalInstance();
  const config = getPublicConfig();
  if (!msal || !config.enabled) {
    throw new Error('entra_not_configured');
  }

  await msal.loginRedirect({
    scopes: [config.scope],
    prompt: 'select_account'
  });
}

export async function logoutFromEntra() {
  const msal = await getMsalInstance();
  if (!msal) return;

  await msal.logoutRedirect({
    postLogoutRedirectUri: getRedirectUri()
  });
}
