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

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        {/* I18nProvider stores locale locally and allows fast PT-BR/EN-US toggle. */}
        <I18nProvider>
          <AppNav />
          <main className="container">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
