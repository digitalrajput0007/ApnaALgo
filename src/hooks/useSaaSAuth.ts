import { useCallback, useEffect, useState } from 'react';

export type SubscriptionPlan = '1m' | '3m' | '6m' | '1y' | 'admin';
export type AccountStatus = 'active' | 'deactivated';

export interface SaaSUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'trader';
  status: AccountStatus;
  mustChangePassword: boolean;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStartedAt: number | null;
  subscriptionExpiresAt: number | null;
  avatarDataUrl: string | null;
  bio: string;
  hasRecoveryKey: boolean;
  createdAt: number;
}

export interface RecoveryOptionsResult {
  hasRecoveryKey: boolean;
  hasTelegramOtp: boolean;
}

export function useSaaSAuth() {
  const [user, setUser] = useState<SaaSUser | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [pendingRecoveryKeyBanner, setPendingRecoveryKeyBanner] = useState<
    string | null
  >(null);

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
        const data = (await resp.json()) as {
          user?: SaaSUser;
          recoveryKey?: string;
          error?: string;
        };
        if (!resp.ok || !data.user) {
          throw new Error(data.error || 'Account creation failed.');
        }
        setUser(data.user);
        setRegisteredUsers((c) => c + 1);
        if (data.recoveryKey) {
          setPendingRecoveryKeyBanner(data.recoveryKey);
        }
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
    setPendingRecoveryKeyBanner(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (patch: {
      name?: string;
      bio?: string;
      avatarDataUrl?: string | null;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const resp = await fetch('/api/account/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(patch),
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          user?: SaaSUser;
          error?: string;
        };
        if (!resp.ok || !data.user) {
          return { ok: false, error: data.error || 'Could not update profile.' };
        }
        setUser(data.user);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Network error.',
        };
      }
    },
    []
  );

  const changePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const resp = await fetch('/api/account/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          user?: SaaSUser;
          error?: string;
        };
        if (!resp.ok) {
          return {
            ok: false,
            error: data.error || 'Could not change password.',
          };
        }
        if (data.user) {
          setUser(data.user);
        } else {
          setUser((prev) =>
            prev ? { ...prev, mustChangePassword: false } : prev
          );
        }
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Network error.',
        };
      }
    },
    []
  );

  const regenerateRecoveryKey = useCallback(async (): Promise<{
    ok: boolean;
    recoveryKey?: string;
    error?: string;
  }> => {
    try {
      const resp = await fetch('/api/account/recovery-key/regenerate', {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        recoveryKey?: string;
        user?: SaaSUser;
        error?: string;
      };
      if (!resp.ok || !data.recoveryKey) {
        return {
          ok: false,
          error: data.error || 'Could not generate recovery key.',
        };
      }
      if (data.user) setUser(data.user);
      return { ok: true, recoveryKey: data.recoveryKey };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Network error.',
      };
    }
  }, []);

  const checkRecoveryOptions = useCallback(
    async (email: string): Promise<RecoveryOptionsResult> => {
      try {
        const resp = await fetch('/api/auth/forgot/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (!resp.ok) {
          return { hasRecoveryKey: true, hasTelegramOtp: false };
        }
        return (await resp.json()) as RecoveryOptionsResult;
      } catch {
        return { hasRecoveryKey: true, hasTelegramOtp: false };
      }
    },
    []
  );

  const requestTelegramRecoveryOtp = useCallback(
    async (email: string): Promise<{ ok: boolean; message?: string; error?: string }> => {
      try {
        const resp = await fetch('/api/auth/forgot/telegram-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          message?: string;
          error?: string;
        };
        if (!resp.ok) {
          return { ok: false, error: data.error || 'Could not send Telegram code.' };
        }
        return { ok: true, message: data.message };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Network error.',
        };
      }
    },
    []
  );

  const resetPasswordWithRecovery = useCallback(
    async (payload: {
      email: string;
      recoveryKey?: string;
      otpCode?: string;
      newPassword: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      setAuthError(null);
      setSubmitting(true);
      try {
        const resp = await fetch('/api/auth/forgot/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          user?: SaaSUser;
          nextRecoveryKey?: string | null;
          error?: string;
        };
        if (!resp.ok || !data.user) {
          const msg = data.error || 'Password recovery failed.';
          setAuthError(msg);
          return { ok: false, error: msg };
        }
        setUser(data.user);
        if (data.nextRecoveryKey) {
          setPendingRecoveryKeyBanner(data.nextRecoveryKey);
        }
        return { ok: true };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Password recovery failed.';
        setAuthError(msg);
        return { ok: false, error: msg };
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  return {
    user,
    isAdmin: user?.role === 'owner',
    registeredUsers,
    loading,
    authError,
    submitting,
    pendingRecoveryKeyBanner,
    dismissRecoveryKeyBanner: () => setPendingRecoveryKeyBanner(null),
    clearError: () => setAuthError(null),
    login,
    register,
    logout,
    refreshSession,
    updateProfile,
    changePassword,
    regenerateRecoveryKey,
    checkRecoveryOptions,
    requestTelegramRecoveryOtp,
    resetPasswordWithRecovery,
  };
}

export type SaaSAuthController = ReturnType<typeof useSaaSAuth>;
