'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminNav } from '@/components/AdminNav';
import {
  clearAdminToken,
  getAdminToken,
  getAuthMode,
  isAuthEnabled,
  saveAdminToken,
  saveAdminUser
} from '@/lib/auth';
import {
  bootstrapEntraSession,
  getCurrentEntraUser,
  getEntraConfig
} from '@/lib/entra';

export function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function syncSession() {
      const authRequired = isAuthEnabled();
      const mode = getAuthMode();
      const token = getAdminToken();

      if (!authRequired) {
        if (pathname === '/login') {
          router.replace('/');
          return;
        }
        if (!cancelled) setReady(true);
        return;
      }

      if (mode === 'entra') {
        const entraConfig = getEntraConfig();
        if (!entraConfig.enabled) {
          clearAdminToken();
          if (!cancelled) setReady(true);
          return;
        }

        const sessionToken = token || await bootstrapEntraSession();
        if (sessionToken) {
          saveAdminToken(sessionToken);
          const user = await getCurrentEntraUser();
          if (user) saveAdminUser(user);
          if (pathname === '/login') {
            router.replace('/');
            return;
          }
          if (!cancelled) setReady(true);
          return;
        }

        if (pathname !== '/login') {
          router.replace('/login');
          return;
        }

        if (!cancelled) setReady(true);
        return;
      }

      if (!token && pathname !== '/login') {
        router.replace('/login');
        return;
      }

      if (token && pathname === '/login') {
        router.replace('/');
        return;
      }

      if (!cancelled) setReady(true);
    }

    syncSession();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) return <p>Verificando sessão...</p>;

  return (
    <>
      {pathname !== '/login' && <AdminNav />}
      {children}
    </>
  );
}
