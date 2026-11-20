import React, { useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Moon,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { SaaSAuthController } from '../hooks/useSaaSAuth';
import { BrandLogo } from './BrandLogo';

interface ForcePasswordChangeScreenProps {
  auth: SaaSAuthController;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

const DEFAULT_CUSTOMER_PASSWORD = 'neo@123';

export const ForcePasswordChangeScreen: React.FC<
  ForcePasswordChangeScreenProps
> = ({ auth, theme = 'dark', onToggleTheme }) => {
  const user = auth.user!;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Enter your current temporary password.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword === DEFAULT_CUSTOMER_PASSWORD) {
      setError('Please choose a personal password instead of neo@123.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your temporary password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    const res = await auth.changePassword(currentPassword, newPassword);
    setSubmitting(false);

    if (res.ok) {
      toast.success('Password updated. Welcome to NeoAlgo.');
    } else {
      setError(res.error || 'Could not update password.');
    }
  };

  const inputCls =
    'w-full px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500';

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0B0F17] flex flex-col justify-between px-4 sm:px-6 py-8">
      {/* Top Bar */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between">
        <BrandLogo size="md" />
        <div className="flex items-center gap-2">
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
              }
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => void auth.logout()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* Main Mandatory Password Change Card */}
      <main className="w-full max-w-[440px] mx-auto my-8">
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-7 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/30 px-3 py-1.5 rounded-lg">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Password update required</span>
            </div>

            <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Set your new password
            </h1>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Welcome,{' '}
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {user.name}
              </span>{' '}
              ({user.email}). For security, please replace your default
              temporary password before accessing your trading dashboard.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200/80 dark:border-red-500/30 rounded-lg"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="force-current-password"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Current temporary password
              </label>
              <div className="relative">
                <input
                  id="force-current-password"
                  type={showPasswords ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter default password (neo@123)"
                  autoComplete="current-password"
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords((s) => !s)}
                  aria-label={
                    showPasswords ? 'Hide passwords' : 'Show passwords'
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPasswords ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                New personal password
              </span>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
                className={inputCls}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Confirm new password
              </span>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                className={inputCls}
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4" aria-hidden="true" />
              <span>
                {submitting
                  ? 'Updating password...'
                  : 'Save new password & continue'}
              </span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </main>

      <footer className="w-full max-w-md mx-auto text-center text-xs text-slate-400 dark:text-slate-500">
        Your new password is encrypted and cannot be viewed by anyone.
      </footer>
    </div>
  );
};
