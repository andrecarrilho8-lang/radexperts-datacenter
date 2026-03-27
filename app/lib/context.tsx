'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { today, def30, buildPresets, Preset } from './utils';

export type UserRole = 'TOTAL' | 'NORMAL';

type DashboardContextType = {
  dateFrom: string;
  dateTo: string;
  setDateRange: (from: string, to: string) => void;
  activePreset: string;
  setActivePreset: (p: string) => void;
  presets: Preset[];
  isAuthenticated: boolean;
  setIsAuthenticated: (val: boolean) => void;
  checkingAuth: boolean;
  // User info
  userRole: UserRole;
  userName: string;
  userUsername: string;
  authToken: string;
  logout: () => void;
};

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [dateFrom, setDateFrom] = useState(def30);
  const [dateTo, setDateTo] = useState(today);
  const [activePreset, setActivePreset] = useState('30 dias');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userRole, setUserRole] = useState<UserRole>('NORMAL');
  const [userName, setUserName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [authToken, setAuthToken] = useState('');

  const presets = buildPresets();

  useEffect(() => {
    const token = localStorage.getItem('auth_token_10x');
    if (token) {
      try {
        const payload = JSON.parse(atob(token));
        setUserRole(payload.role || 'NORMAL');
        setUserName(payload.name || '');
        setUserUsername(payload.username || '');
        setAuthToken(token);
        setIsAuthenticated(true);
      } catch {
        localStorage.removeItem('auth_token_10x');
      }
    }
    // Backward compat with old simple auth — migrate to new token
    else if (localStorage.getItem('auth_10x') === 'true') {
      const payload = { id: 'admin-001', username: 'adv10x', role: 'TOTAL', name: 'Administrador' };
      const syntheticToken = btoa(JSON.stringify(payload));
      localStorage.setItem('auth_token_10x', syntheticToken);
      localStorage.removeItem('auth_10x');
      setUserRole('TOTAL');
      setUserName('Administrador');
      setUserUsername('adv10x');
      setAuthToken(syntheticToken);
      setIsAuthenticated(true);
    }
    setCheckingAuth(false);
  }, []);

  const setDateRange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dashboard:loading'));
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token_10x');
    localStorage.removeItem('auth_10x');
    setIsAuthenticated(false);
    setUserRole('NORMAL');
    setUserName('');
    setUserUsername('');
    setAuthToken('');
  };

  return (
    <DashboardContext.Provider value={{
      dateFrom, dateTo, setDateRange,
      activePreset, setActivePreset, presets,
      isAuthenticated, setIsAuthenticated, checkingAuth,
      userRole, userName, userUsername, authToken, logout,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
