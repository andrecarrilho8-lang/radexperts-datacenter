'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDashboard } from '@/app/lib/context';
import { LoginScreen } from '@/components/ui/auth-and-cards';

/**
 * Pages each role is allowed to access.
 * If the current path doesn't match, redirect to the role's home page.
 *
 * TOTAL     → tudo (sem restrição)
 * NORMAL    → tudo exceto /financeiro e /conta-azul
 * TRAFEGO   → /resumo + /campanhas + /trafego + /historico
 * COMERCIAL → /vendas + /financeiro + /conta-azul + /cursos + /alunos + /leads
 */

const ROLE_HOME: Record<string, string> = {
  TOTAL:    '/resumo',
  NORMAL:   '/resumo',
  TRAFEGO:  '/resumo',
  COMERCIAL: '/vendas',
};

const ROLE_ALLOWED: Record<string, string[]> = {
  // TOTAL has no restriction — handled by returning early
  NORMAL: [
    '/resumo', '/vendas', '/campanhas', '/campanhas-ativas',
    '/trafego', '/historico', '/cursos', '/alunos', '/leads',
    '/hotmart', '/atividades',
  ],
  TRAFEGO: [
    '/resumo', '/campanhas', '/campanhas-ativas', '/trafego', '/historico',
  ],
  COMERCIAL: [
    '/vendas', '/financeiro', '/conta-azul', '/cursos', '/alunos', '/leads',
  ],
};

export function LoginWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setIsAuthenticated, checkingAuth, userRole } = useDashboard();
  const pathname = usePathname();
  const router   = useRouter();

  useEffect(() => {
    if (checkingAuth || !isAuthenticated || userRole === 'TOTAL') return;

    const allowed = ROLE_ALLOWED[userRole] ?? [];
    const isAllowed = allowed.some(p => pathname.startsWith(p));

    if (!isAllowed) {
      router.replace(ROLE_HOME[userRole] ?? '/resumo');
    }
  }, [checkingAuth, isAuthenticated, userRole, pathname]);

  if (checkingAuth) return null;
  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={() => {
          setIsAuthenticated(true);
          window.location.reload();
        }}
      />
    );
  }

  return <>{children}</>;
}
