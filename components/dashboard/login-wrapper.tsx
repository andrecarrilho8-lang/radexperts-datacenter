'use client';

import React from 'react';
import { useDashboard } from '@/app/lib/context';
import { LoginScreen } from '@/components/ui/auth-and-cards';

export function LoginWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setIsAuthenticated, checkingAuth } = useDashboard();

  if (checkingAuth) return null;
  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={(token, role, name) => {
          // Context reads token from localStorage on next render
          setIsAuthenticated(true);
          // Force reload so context re-reads token
          window.location.reload();
        }}
      />
    );
  }

  return <>{children}</>;
}
