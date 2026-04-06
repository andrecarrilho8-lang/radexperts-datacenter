'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDashboard } from '@/app/lib/context';
import { LoginScreen } from '@/components/ui/auth-and-cards';

// Pages accessible to TRAFEGO role
const TRAFEGO_ALLOWED  = ['/campanhas', '/trafego', '/historico'];
// Pages accessible to COMERCIAL role
const COMERCIAL_ALLOWED = ['/hotmart', '/cursos', '/alunos', '/leads'];

export function LoginWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setIsAuthenticated, checkingAuth, userRole } = useDashboard();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (checkingAuth || !isAuthenticated) return;
    if (userRole === 'TRAFEGO') {
      const allowed = TRAFEGO_ALLOWED.some(p => pathname.startsWith(p));
      if (!allowed) router.replace('/campanhas');
    }
    if (userRole === 'COMERCIAL') {
      const allowed = COMERCIAL_ALLOWED.some(p => pathname.startsWith(p));
      if (!allowed) router.replace('/cursos');
    }
  }, [checkingAuth, isAuthenticated, userRole, pathname]);

  if (checkingAuth) return null;
  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={(token, role, name) => {
          setIsAuthenticated(true);
          window.location.reload();
        }}
      />
    );
  }

  return <>{children}</>;
}
