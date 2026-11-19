import { useCallback, useEffect, useState } from 'react';

export interface SaaSUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'trader';
  createdAt: number;
}

export function useSaaSAuth() {
  const [user, setUser] = useState<SaaSUser | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const refreshSession = useCallback(async () => {
    try {
      const resp = await fetch('/api/auth/me', { credentials: 'include' });
      const data = (await resp.json()) as {
        authenticated?: boolean;
        user?: SaaSUser | null;
        registeredUsers?: number;
      };
      setUser(data.authenticated && data.user ? data.user : null);
      setRegisteredUsers(data.registeredUsers ?? 0);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    setSubmitting(true);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = (await resp.json()) as { user?: SaaSUser; error?: string };
      if (!resp.ok || !data.user) {
        throw new Error(data.error || 'Sign in failed.');
      }
      setUser(data.user);
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign in failed.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      setAuthError(null);
      setSubmitting(true);
      try {
        const resp = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, email, password }),
        });
        const data = (await resp.json()) as { user?: SaaSUser; error?: string };
        if (!resp.ok || !data.user) {
          throw new Error(data.error || 'Account creation failed.');
        }
        setUser(data.user);
        setRegisteredUsers((c) => c + 1);
        return true;
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'Account creation failed.'
        );
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore network errors on sign out
    }
    setUser(null);
  }, []);

  return {
    user,
    registeredUsers,
    loading,
    authError,
    submitting,
    clearError: () => setAuthError(null),
    login,
    register,
    logout,
    refreshSession,
  };
}

export type SaaSAuthController = ReturnType<typeof useSaaSAuth>;
