import './globals.css';
import { AdminShell } from '@/components/AdminShell';

export const metadata = {
  title: 'VRM Admin',
  description: 'Administrative portal for video-request-manager',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg'
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }) {
  const runtimeConfig = {
    authMode: process.env.NEXT_PUBLIC_AUTH_MODE || process.env.AUTH_MODE || 'none',
    entraTenantId: process.env.NEXT_PUBLIC_ENTRA_TENANT_ID
      || process.env.NEXT_PUBLIC_AZURE_TENANT_ID
      || process.env.ENTRA_TENANT_ID
      || '',
    entraClientId: process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID
      || process.env.NEXT_PUBLIC_AZURE_CLIENT_ID
      || process.env.ENTRA_CLIENT_ID
      || '',
    entraScope: process.env.NEXT_PUBLIC_ENTRA_SCOPE
      || process.env.NEXT_PUBLIC_AZURE_SCOPE
      || '',
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || '',
    turnstileEnabled: process.env.NEXT_PUBLIC_TURNSTILE_ENABLED || process.env.TURNSTILE_ENABLED || 'false',
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || ''
  };

  return (
    <html lang="pt-BR">
      <body
      >
        <div
          id="vrm-admin-runtime-config"
          hidden
          data-vrm-auth-mode={runtimeConfig.authMode}
          data-vrm-entra-tenant-id={runtimeConfig.entraTenantId}
          data-vrm-entra-client-id={runtimeConfig.entraClientId}
          data-vrm-entra-scope={runtimeConfig.entraScope}
          data-vrm-api-base-url={runtimeConfig.apiBaseUrl}
          data-vrm-turnstile-enabled={runtimeConfig.turnstileEnabled}
          data-vrm-turnstile-site-key={runtimeConfig.turnstileSiteKey}
        />
        <main className="container">
          <AdminShell>{children}</AdminShell>
        </main>
      </body>
    </html>
  );
}
