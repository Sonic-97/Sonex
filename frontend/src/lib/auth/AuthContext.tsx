'use client';

import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface User {
  employeeId: string;
  name: string;
  role: string;
  phone?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshSession = useCallback(async () => {
    const cached = sessionStorage.getItem('sonic_user');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setUser({
          employeeId: parsed.employeeId || '',
          name: parsed.name || '',
          role: (parsed.role || '').toUpperCase(),
          phone: parsed.phone || '',
        });
      } catch {}
    }
    try {
      const { data } = await api.get('/auth/me', { withCredentials: true });
      setUser({
        employeeId: data.employeeId || data.cafeId || '',
        name: data.name || '',
        role: (data.role || '').toUpperCase(),
        phone: data.phone || '',
      });
      sessionStorage.setItem('sonic_user', JSON.stringify({
        employeeId: data.employeeId || data.cafeId || '',
        name: data.name || '',
        role: (data.role || '').toUpperCase(),
        phone: data.phone || '',
      }));
    } catch {
      if (!sessionStorage.getItem('sonic_user')) {
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    refreshSession().finally(() => setLoading(false));
  }, [refreshSession]);

  const login = async (phone: string, code: string) => {
    const { data } = await api.post('/auth/login', { phone, code }, { withCredentials: true });
    setUser({
      employeeId: data.employeeId,
      name: data.name,
      role: data.role,
    });
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {}, { withCredentials: true });
    } catch {
      // ignore
    }
    setUser(null);
    sessionStorage.removeItem('sonic_user');
    sessionStorage.removeItem('sonic_token');
    window.location.href = '/auth';
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated: !!user, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
