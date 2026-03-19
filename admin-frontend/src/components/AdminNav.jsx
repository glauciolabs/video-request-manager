'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { clearAdminToken, getAdminUser, getAuthMode, isAuthEnabled, saveAdminUser } from '@/lib/auth';
import { getCurrentEntraUser, logoutFromEntra } from '@/lib/entra';

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const normalized = pathname || '/';
  const authMode = getAuthMode();
  const authEnabled = isAuthEnabled();
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fromStorage = getAdminUser();
    if (!cancelled) setUser(fromStorage);

    async function refreshEntraUser() {
      if (authMode !== 'entra') return;
      const current = await getCurrentEntraUser();
      if (current) {
        saveAdminUser(current);
        if (!cancelled) setUser(current);
      }
    }

    refreshEntraUser();
    return () => {
      cancelled = true;
    };
  }, [authMode]);

  const displayName = user?.name || user?.email || 'Usuário autenticado';
  const displayEmail = user?.email || '';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase())
    .join('') || 'U';

  const onLogout = async () => {
    if (authMode === 'entra') {
      clearAdminToken();
      await logoutFromEntra();
      return;
    }

    clearAdminToken();
    router.push('/login');
  };

  return (
    <header className="nav">
      <div className="nav-brand">
        <img
          className="brand-logo"
          src="/vrm-logo.svg"
          alt="Video Request Manager logo"
          width="36"
          height="36"
        />
        <strong>video-request-manager admin ({authMode})</strong>
      </div>
      <div className="nav-meta">
        {authEnabled && (
          <div className="nav-user">
            {user?.avatarUrl ? (
              <img className="user-avatar" src={user.avatarUrl} alt={displayName} />
            ) : (
              <span className="user-avatar user-avatar-fallback">{initials}</span>
            )}
            <div className="user-text">
              <strong>{displayName}</strong>
              {displayEmail && <small>{displayEmail}</small>}
            </div>
          </div>
        )}
        <nav>
          <Link className={normalized === '/' ? 'active' : ''} href="/">Dashboard</Link>
          <Link className={normalized.startsWith('/orders') ? 'active' : ''} href="/orders">Pedidos</Link>
          <Link className={normalized.startsWith('/reports') ? 'active' : ''} href="/reports">Relatórios</Link>
          {authEnabled && <button type="button" onClick={onLogout}>Sair</button>}
        </nav>
      </div>
    </header>
  );
}
