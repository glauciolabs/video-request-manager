'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminNav } from '@/components/AdminNav';
import { getAdminToken, isAuthEnabled } from '@/lib/auth';

export function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const authRequired = isAuthEnabled();
    const token = getAdminToken();

    if (authRequired && !token && pathname !== '/login') {
      router.replace('/login');
      return;
    }

    if (authRequired && token && pathname === '/login') {
      router.replace('/');
      return;
    }

    if (!authRequired && pathname === '/login') {
      router.replace('/');
      return;
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready) return <p>Verificando sessão...</p>;

  return (
    <>
      {pathname !== '/login' && <AdminNav />}
      {children}
    </>
  );
}
