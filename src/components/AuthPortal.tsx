import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Send,
} from 'lucide-react';
import { SaaSAuthController } from '../hooks/useSaaSAuth';
import { BrandLogo } from './BrandLogo';

interface AuthPortalProps {
  auth: SaaSAuthController;
}

type AuthMode = 'login' | 'register' | 'forgot';
type RecoveryMethod = 'key' | 'otp';

export const AuthPortal: React.FC<AuthPortalProps> = ({ auth }) => {
  const [mode, setMode] = useState<AuthMode>(
    auth.registeredUsers === 0 ? 'register' : 'login'
  );
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

  useEffect(() => {
    if (auth.registeredUsers === 0 && mode === 'login') {
      setMode('register');
    }
  }, [auth.registeredUsers, mode]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setLocalError(null);
    setOtpStatus(null);
    auth.clearError();
  };

  const handlePrimarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (mode === 'register') {
      await auth.register(name, email, password);
    } else if (mode === 'login') {
      await auth.login(email, password);
    }
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

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col justify-between px-4 sm:px-6 py-8">
      {/* Quiet Top Brand Row */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between">
        <BrandLogo size="md" />
        <span className="text-xs text-slate-400">NIFTY 5m Desk</span>
      </div>

      {/* Centered Focused Auth Card */}
      <main className="w-full max-w-[420px] mx-auto my-8">
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-7 sm:p-8 space-y-6">
          {mode !== 'forgot' ? (
            <>
              <div className="space-y-1.5">
                <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">
                  {mode === 'login'
                    ? 'Sign in to NeoAlgo'
                    : auth.registeredUsers === 0
                    ? 'Create workspace owner account'
                    : 'Create your account'}
                </h1>
                <p className="text-[13px] text-slate-500">
                  {mode === 'login'
                    ? 'Enter your credentials to access your trading desk.'
                    : 'Set up your private strategy, broker, and alert workspace.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Create account
                </button>
              </div>

              {displayError && (
                <div
                  role="alert"
                  className="px-3.5 py-2.5 text-xs text-red-700 bg-red-50 border border-red-200/80 rounded-lg"
                >
                  {displayError}
                </div>
              )}

              <form onSubmit={handlePrimarySubmit} className="space-y-4">
                {mode === 'register' && (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-700">
                      Full name
                    </span>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Aarav Sharma"
                      autoComplete="name"
                      className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-colors"
                    />
                  </label>
                )}

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">
                    Email
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    autoComplete="email"
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-colors"
                  />
                </label>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="auth-password"
                      className="text-xs font-medium text-slate-700"
                    >
                      Password
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        mode === 'register'
                          ? 'Minimum 6 characters'
                          : 'Enter your password'
                      }
                      autoComplete={
                        mode === 'register' ? 'new-password' : 'current-password'
                      }
                      className="w-full px-3.5 py-2.5 pr-10 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
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
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  <span>
                    {auth.submitting
                      ? 'Please wait...'
                      : mode === 'login'
                      ? 'Sign in'
                      : 'Create account'}
                  </span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </form>
            </>
          ) : (
            /* Password Recovery Flow */
            <>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Back to sign in</span>
                </button>
                <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">
                  Recover your password
                </h1>
                <p className="text-[13px] text-slate-500">
                  Verify using your saved Recovery Key, or request a 6-digit
                  reset code via Telegram or your workspace owner.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod('key');
                    setLocalError(null);
                    auth.clearError();
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    recoveryMethod === 'key'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
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
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>6-Digit Code</span>
                </button>
              </div>

              {displayError && (
                <div
                  role="alert"
                  className="px-3.5 py-2.5 text-xs text-red-700 bg-red-50 border border-red-200/80 rounded-lg"
                >
                  {displayError}
                </div>
              )}

              {otpStatus && (
                <div
                  className={`px-3.5 py-2.5 text-xs rounded-lg border ${
                    otpStatus.kind === 'info'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {otpStatus.text}
                </div>
              )}

              <form onSubmit={handleRecoverySubmit} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">
                    Account email
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    autoComplete="email"
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  />
                </label>

                {recoveryMethod === 'key' ? (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-700">
                      Recovery key
                    </span>
                    <input
                      type="text"
                      required
                      value={recoveryKey}
                      onChange={(e) => setRecoveryKey(e.target.value)}
                      placeholder="NA-XXXX-XXXX-XXXX-XXXX"
                      className="w-full px-3.5 py-2.5 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                    />
                  </label>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="recovery-otp"
                        className="text-xs font-medium text-slate-700"
                      >
                        6-digit reset code
                      </label>
                      <button
                        type="button"
                        disabled={sendingOtp}
                        onClick={() => void handleRequestTelegramOtp()}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 cursor-pointer"
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
                      className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                    />
                    <p className="text-[11px] text-slate-500">
                      Use the code sent to your linked Telegram DM, or a 6-digit
                      code issued by your workspace owner.
                    </p>
                  </div>
                )}

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">
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
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">
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
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  />
                </label>

                <button
                  type="submit"
                  disabled={auth.submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
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
      <footer className="w-full max-w-md mx-auto text-center text-xs text-slate-400">
        Encrypted self-hosted workspace · Per-user isolated broker vaults
      </footer>
    </div>
  );
};
