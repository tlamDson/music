'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../lib/api-client';
import type { AuthTokens } from '@cafe-music/shared';

interface LoginPayload {
  email: string;
  password: string;
}

interface User {
  id: string;
  email: string;
  role: string;
  organizationId: string | null;
  storeId: string | null;
}

function parseJwt(token: string): User | null {
  try {
    const base64 = token.split('.')[1];
    const decoded = JSON.parse(atob(base64.replace(/-/g, '+').replace(/_/g, '/')));
    return {
      id: decoded.sub as string,
      email: decoded.email as string,
      role: decoded.role as string,
      organizationId: (decoded.organizationId as string | null) ?? null,
      storeId: (decoded.storeId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) setUser(parseJwt(token));
    setLoading(false);
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const tokens = await api.post<AuthTokens>('/auth/login', payload);
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    const parsed = parseJwt(tokens.accessToken);
    setUser(parsed);
    return parsed;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  }, []);

  return { user, loading, login, logout };
}
