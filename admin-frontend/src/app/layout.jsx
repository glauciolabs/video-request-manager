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

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <main className="container">
          <AdminShell>{children}</AdminShell>
        </main>
      </body>
    </html>
  );
}
