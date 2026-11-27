import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Moon,
  Send,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { SaaSAuthController } from '../hooks/useSaaSAuth';
import { BrandLogo } from './BrandLogo';

interface AuthPortalProps {
  auth: SaaSAuthController;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

type AuthMode = 'login' | 'setup' | 'forgot';
type RecoveryMethod = 'key' | 'otp';

export const AuthPortal: React.FC<AuthPortalProps> = ({
  auth,
  theme = 'dark',
  onToggleTheme,
}) => {
  // Home screen always opens directly on Sign In — never trapped on registration
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Recovery flow state
  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>('key');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpStatus, setOtpStatus] = useState<{
    kind: 'info' | 'error';
    text: string;
  } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const canInitializeAdmin = auth.registeredUsers === 0;

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setLocalError(null);
    setOtpStatus(null);
    auth.clearError();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    await auth.login(email, password);
  };

  const handleAdminSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!canInitializeAdmin) {
      setLocalError('Admin account is already configured. Please sign in.');
      setMode('login');
      return;
    }
    await auth.register(name, email, password);
  };

  const handleRequestTelegramOtp = async () => {
    setLocalError(null);
    setOtpStatus(null);
    if (!email.trim()) {
      setLocalError('Enter your account email address first.');
      return;
    }
    setSendingOtp(true);
    const res = await auth.requestTelegramRecoveryOtp(email.trim());
    setSendingOtp(false);
    if (res.ok) {
      setOtpStatus({
        kind: 'info',
        text: res.message || '6-digit verification code sent to your Telegram.',
      });
    } else {
      setOtpStatus({
        kind: 'error',
        text: res.error || 'Could not send Telegram code.',
      });
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (newPassword.length < 6) {
      setLocalError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setLocalError('New password and confirmation do not match.');
      return;
    }
    await auth.resetPasswordWithRecovery({
      email: email.trim(),
      recoveryKey: recoveryMethod === 'key' ? recoveryKey.trim() : undefined,
      otpCode: recoveryMethod === 'otp' ? otpCode.trim() : undefined,
      newPassword,
    });
  };

  const displayError = localError || auth.authError;
  const inputCls =
    'w-full px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500';

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0B0F17] flex flex-col justify-between px-4 sm:px-6 py-8">
      {/* Quiet Top Brand Row */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between">
        <BrandLogo size="md" />
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Trading Portal
          </span>
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
        </div>
      </div>

      {/* Centered Focused Auth Card */}
      <main className="w-full max-w-[420px] mx-auto my-8">
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-7 sm:p-8 space-y-6">
          {mode === 'login' && (
            <>
              <div className="space-y-1.5">
                <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Sign in to NeoAlgo
                </h1>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  Enter your credentials provided by your administrator to access
                  your trading dashboard.
                </p>
              </div>

              {displayError && (
                <div
                  role="alert"
                  className="px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200/80 dark:border-red-500/30 rounded-lg"
                >
                  {displayError}
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    autoComplete="email"
                    className={inputCls}
                  />
                </label>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="auth-password"
                      className="text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className={`${inputCls} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={auth.submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  <span>{auth.submitting ? 'Signing in...' : 'Sign in'}</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </form>

              {auth.devAutoLoginAvailable && (
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/90">
                  <button
                    type="button"
                    disabled={auth.submitting}
                    onClick={() => void auth.resumeDevPreview()}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Continue as Admin (Development Preview)</span>
                  </button>
                </div>
              )}

              {canInitializeAdmin && (
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/90 text-center">
                  <button
                    type="button"
                    onClick={() => switchMode('setup')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>First-time server setup? Initialize Admin account</span>
                  </button>
                </div>
              )}
            </>
          )}

          {mode === 'setup' && (
            <>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Back to sign in</span>
                </button>
                <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Initialize Admin account
                </h1>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  One-time setup for the primary administrator. Afterwards, only
                  the Admin can create and manage customer accounts.
                </p>
              </div>

              {displayError && (
                <div
                  role="alert"
                  className="px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200/80 dark:border-red-500/30 rounded-lg"
                >
                  {displayError}
                </div>
              )}

              <form onSubmit={handleAdminSetupSubmit} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Admin full name
                  </span>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Admin Name"
                    autoComplete="name"
                    className={inputCls}
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Admin email
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@domain.com"
                    autoComplete="email"
                    className={inputCls}
                  />
                </label>

                <div className="space-y-1.5">
                  <label
                    htmlFor="setup-password"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="setup-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
                      className={`${inputCls} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={auth.submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  <span>
                    {auth.submitting
                      ? 'Creating Admin...'
                      : 'Create Admin account'}
                  </span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </form>
            </>
          )}

          {mode === 'forgot' && (
            /* Password Recovery Flow */
            <>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Back to sign in</span>
                </button>
                <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Recover your password
                </h1>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  Verify using your saved Recovery Key, a 6-digit Telegram code,
                  or contact your administrator for a password reset.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod('key');
                    setLocalError(null);
                    auth.clearError();
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    recoveryMethod === 'key'
                      ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Recovery Key</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod('otp');
                    setLocalError(null);
                    auth.clearError();
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    recoveryMethod === 'otp'
                      ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>6-Digit Code</span>
                </button>
              </div>

              {displayError && (
                <div
                  role="alert"
                  className="px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200/80 dark:border-red-500/30 rounded-lg"
                >
                  {displayError}
                </div>
              )}

              {otpStatus && (
                <div
                  className={`px-3.5 py-2.5 text-xs rounded-lg border ${
                    otpStatus.kind === 'info'
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  {otpStatus.text}
                </div>
              )}

              <form onSubmit={handleRecoverySubmit} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Account email
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    autoComplete="email"
                    className={inputCls}
                  />
                </label>

                {recoveryMethod === 'key' ? (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Recovery key
                    </span>
                    <input
                      type="text"
                      required
                      value={recoveryKey}
                      onChange={(e) => setRecoveryKey(e.target.value)}
                      placeholder="NA-XXXX-XXXX-XXXX-XXXX"
                      className={`font-mono ${inputCls}`}
                    />
                  </label>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="recovery-otp"
                        className="text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        6-digit reset code
                      </label>
                      <button
                        type="button"
                        disabled={sendingOtp}
                        onClick={() => void handleRequestTelegramOtp()}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 cursor-pointer"
                      >
                        {sendingOtp ? 'Sending...' : 'Send code to Telegram'}
                      </button>
                    </div>
                    <input
                      id="recovery-otp"
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456"
                      className={`font-mono tracking-widest ${inputCls}`}
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Use the code sent to your linked Telegram DM, or a 6-digit
                      code issued by your administrator.
                    </p>
                  </div>
                )}

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    New password
                  </span>
                  <input
                    type="password"
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
                    type="password"
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    className={inputCls}
                  />
                </label>

                <button
                  type="submit"
                  disabled={auth.submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  <span>
                    {auth.submitting
                      ? 'Updating password...'
                      : 'Reset password & sign in'}
                  </span>
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="w-full max-w-md mx-auto text-center text-xs text-slate-400 dark:text-slate-500">
        Managed trading portal · Isolated per-account broker vaults
      </footer>
    </div>
  );
};
