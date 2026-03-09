'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { clearAdminToken, getAuthMode, isAuthEnabled } from '@/lib/auth';

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const normalized = pathname.replace(/^\/admin/, '') || '/';
  const authMode = getAuthMode();
  const authEnabled = isAuthEnabled();

  const onLogout = () => {
    clearAdminToken();
    router.push('/login');
  };

  return (
    <header className="nav">
      <div className="nav-brand">
        <img
          className="brand-logo"
          src="/admin/vrm-logo.svg"
          alt="Video Request Manager logo"
          width="36"
          height="36"
        />
        <strong>video-request-manager admin ({authMode})</strong>
      </div>
      <nav>
        <Link className={normalized === '/' ? 'active' : ''} href="/">Dashboard</Link>
        <Link className={normalized.startsWith('/orders') ? 'active' : ''} href="/orders">Pedidos</Link>
        <Link className={normalized.startsWith('/reports') ? 'active' : ''} href="/reports">Relatórios</Link>
        {authEnabled && <button type="button" onClick={onLogout}>Sair</button>}
      </nav>
    </header>
  );
}
