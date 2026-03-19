import './globals.css';
import { I18nProvider } from '@/lib/i18n/I18nProvider';
import { AppNav } from '@/components/AppNav';

export const metadata = {
  title: 'Video Request Manager',
  description: 'Client/Admin portal for video orders',
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
    turnstileEnabled: process.env.NEXT_PUBLIC_TURNSTILE_ENABLED || process.env.TURNSTILE_ENABLED || 'false',
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || '',
    pixPaymentKey: process.env.NEXT_PUBLIC_PIX_PAYMENT_KEY || process.env.PIX_PAYMENT_KEY || '',
    formEntryEnabled: process.env.NEXT_PUBLIC_FORM_ENTRY_ENABLED || process.env.FORM_ENTRY_ENABLED || 'false'
  };

  return (
    <html lang="pt-BR">
      <body>
        <div
          id="vrm-runtime-config"
          hidden
          data-vrm-turnstile-enabled={runtimeConfig.turnstileEnabled}
          data-vrm-turnstile-site-key={runtimeConfig.turnstileSiteKey}
          data-vrm-pix-payment-key={runtimeConfig.pixPaymentKey}
          data-vrm-form-entry-enabled={runtimeConfig.formEntryEnabled}
        />
        {/* I18nProvider stores locale locally and allows fast PT-BR/EN-US toggle. */}
        <I18nProvider>
          <AppNav />
          <main className="container">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
