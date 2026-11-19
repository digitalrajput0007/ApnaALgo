import React, { useEffect, useState } from 'react';
import { ArrowRight, Lock, Mail, User } from 'lucide-react';
import { SaaSAuthController } from '../hooks/useSaaSAuth';
import { BrandLogo } from './BrandLogo';

interface AuthPortalProps {
  auth: SaaSAuthController;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({ auth }) => {
  const [mode, setMode] = useState<'login' | 'register'>(
    auth.registeredUsers === 0 ? 'register' : 'login'
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (auth.registeredUsers === 0) {
      setMode('register');
    }
  }, [auth.registeredUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'register') {
      await auth.register(name, email, password);
    } else {
      await auth.login(email, password);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 lg:grid-cols-2">
      {/* Left Brand & Platform Panel */}
      <div className="bg-slate-900 text-slate-100 px-8 sm:px-12 py-12 flex flex-col justify-between gap-12">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2.5 select-none">
            <svg
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 shrink-0"
              aria-hidden="true"
            >
              <rect width="36" height="36" rx="9" fill="#1E293B" />
              <rect
                x="0.75"
                y="0.75"
                width="34.5"
                height="34.5"
                rx="8.25"
                stroke="#334155"
                strokeWidth="1.5"
              />
              <line
                x1="11"
                y1="9"
                x2="11"
                y2="27"
                stroke="#64748B"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <rect x="8.75" y="15" width="4.5" height="8" rx="1.25" fill="#94A3B8" />
              <line
                x1="18"
                y1="8"
                x2="18"
                y2="25"
                stroke="#3B82F6"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <rect x="15.75" y="12" width="4.5" height="9.5" rx="1.25" fill="#3B82F6" />
              <line
                x1="25"
                y1="7"
                x2="25"
                y2="22"
                stroke="#10B981"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <rect x="22.75" y="9.5" width="4.5" height="9" rx="1.25" fill="#10B981" />
              <path
                d="M9.5 25.5L18 19.5L26.5 11.5"
                stroke="#F8FAFC"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="leading-none">
              <span className="font-display text-lg font-bold tracking-tight text-white">
                Neo<span className="text-blue-400">Algo</span>
              </span>
              <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                Multi-User Quantitative Desk
              </div>
            </div>
          </div>

          <span className="text-xs font-mono text-slate-400">
            Self-Hosted SaaS
          </span>
        </div>

        <div className="max-w-md space-y-6">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight [text-wrap:balance]">
            Systematic NIFTY trading with isolated broker workspaces
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Each trader signs into their own private workspace with persistent
            strategy rules, 1-year historical backtesting, monthly paper trade
            calendars, and encrypted broker connections.
          </p>

          <div className="pt-4 border-t border-slate-800 space-y-4">
            <div>
              <div className="text-xs font-semibold text-white">
                01. Per-User Encrypted Broker Vault
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Connect your Fyers API v3 account today via OAuth 2.0. Built on
                an extensible broker registry ready for Zerodha, Dhan, Upstox,
                and Angel One.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-white">
                02. 1-Year Backtester &amp; Parameter Optimizer
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Sweep SL, Target, Wilder RSI(2), Entry Buffer, and Daily Trade
                Caps across custom NSE date ranges and save winning setups.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-white">
                03. Monthly Paper Trade Calendar
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Archive backtested sessions and live paper trades into a
                searchable monthly calendar with weekly totals and trade notes.
              </p>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-5">
          <span>NeoAlgo · NSE NIFTY 5m Systematic Platform</span>
          <span className="font-mono">AWS VPS Ready</span>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <BrandLogo size="md" showSubtitle />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-7 space-y-6">
            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
                {mode === 'login'
                  ? 'Sign in to your workspace'
                  : auth.registeredUsers === 0
                  ? 'Create administrator account'
                  : 'Create your trader account'}
              </h2>
              <p className="text-xs text-slate-500">
                {mode === 'login'
                  ? 'Access your saved strategies, paper calendar, and connected brokers.'
                  : 'Set up an isolated NeoAlgo workspace to connect your Fyers account.'}
              </p>
            </div>

            {/* Mode Switch */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  auth.clearError();
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  auth.clearError();
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>

            {auth.authError && (
              <div
                role="alert"
                className="px-3.5 py-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg"
              >
                {auth.authError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    Full Name
                  </span>
                  <div className="relative mt-1.5">
                    <User
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Aarav Sharma"
                      autoComplete="name"
                      className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                </label>
              )}

              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Email Address
                </span>
                <div className="relative mt-1.5">
                  <Mail
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@example.com"
                    autoComplete="email"
                    className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Password
                </span>
                <div className="relative mt-1.5">
                  <Lock
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === 'register'
                        ? 'At least 6 characters'
                        : 'Enter your password'
                    }
                    autoComplete={
                      mode === 'register' ? 'new-password' : 'current-password'
                    }
                    className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={auth.submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
              >
                <span>
                  {auth.submitting
                    ? 'Please wait...'
                    : mode === 'login'
                    ? 'Sign In to Workspace'
                    : 'Create Account'}
                </span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-500">
            Passwords are hashed with per-user scrypt salts. Broker tokens are
            encrypted per user with AES-256-GCM on your server.
          </p>
        </div>
      </div>
    </div>
  );
};
