import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  Wifi,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AccountStatus, SubscriptionPlan } from '../hooks/useSaaSAuth';
import { UserAvatar } from './UserAvatar';

export interface AdminManagedUserRecord {
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
  fyersConnected: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
}

const PLAN_OPTIONS: {
  id: Exclude<SubscriptionPlan, 'admin'>;
  label: string;
  short: string;
  days: string;
}[] = [
  { id: '1m', label: '1 Month', short: '1M', days: '30 days' },
  { id: '3m', label: '3 Months', short: '3M', days: '90 days' },
  { id: '6m', label: '6 Months', short: '6M', days: '180 days' },
  { id: '1y', label: '1 Year', short: '1Y', days: '365 days' },
];

function planLabel(plan: SubscriptionPlan): string {
  switch (plan) {
    case '1m':
      return '1 Month';
    case '3m':
      return '3 Months';
    case '6m':
      return '6 Months';
    case '1y':
      return '1 Year';
    case 'admin':
      return 'Admin';
  }
}

function formatDateIst(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export const AdminUsersView: React.FC = () => {
  const [users, setUsers] = useState<AdminManagedUserRecord[]>([]);
  const [defaultPassword, setDefaultPassword] = useState<string>('neo@123');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Create customer form state
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPlan, setNewPlan] =
    useState<Exclude<SubscriptionPlan, 'admin'>>('1m');
  const [creating, setCreating] = useState(false);

  // Credentials banner shown after creating user or resetting password
  const [credentialsBanner, setCredentialsBanner] = useState<{
    title: string;
    name: string;
    email: string;
    password: string;
    planLabel: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Search & filter
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'deactivated' | 'expired'
  >('all');

  // Inline confirmation & busy states per user
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [confirmToggleId, setConfirmToggleId] = useState<string | null>(null);
  const [renewTargetId, setRenewTargetId] = useState<string | null>(null);
  const [renewPlan, setRenewPlan] =
    useState<Exclude<SubscriptionPlan, 'admin'>>('1m');

  const fetchUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const resp = await fetch('/api/admin/users', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await resp.json()) as {
        users?: AdminManagedUserRecord[];
        defaultCustomerPassword?: string;
        error?: string;
      };
      if (!resp.ok) {
        toast.error(data.error || 'Could not load users.');
        return;
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
      if (data.defaultCustomerPassword) {
        setDefaultPassword(data.defaultCustomerPassword);
      }
    } catch {
      toast.error('Network error while loading users.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers(false);
  }, [fetchUsers]);

  const customers = useMemo(
    () => users.filter((u) => u.role !== 'owner'),
    [users]
  );

  const stats = useMemo(() => {
    const total = customers.length;
    const active = customers.filter(
      (u) => u.status === 'active' && !u.isExpired
    ).length;
    const expiringSoon = customers.filter(
      (u) =>
        u.status === 'active' &&
        !u.isExpired &&
        u.daysRemaining !== null &&
        u.daysRemaining <= 7
    ).length;
    const inactiveOrExpired = customers.filter(
      (u) => u.status === 'deactivated' || u.isExpired
    ).length;
    return { total, active, expiringSoon, inactiveOrExpired };
  }, [customers]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === 'active') {
        if (u.status !== 'active' || u.isExpired) return false;
      } else if (statusFilter === 'deactivated') {
        if (u.status !== 'deactivated') return false;
      } else if (statusFilter === 'expired') {
        if (!u.isExpired) return false;
      }
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        planLabel(u.subscriptionPlan).toLowerCase().includes(q)
      );
    });
  }, [users, query, statusFilter]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim().length < 2) {
      toast.error('Customer full name must be at least 2 characters.');
      return;
    }
    if (!newEmail.trim().includes('@')) {
      toast.error('Enter a valid customer email address.');
      return;
    }

    setCreating(true);
    try {
      const resp = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          subscriptionPlan: newPlan,
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        user?: AdminManagedUserRecord;
        defaultPassword?: string;
        error?: string;
      };
      if (!resp.ok || !data.user) {
        toast.error(data.error || 'Could not create customer account.');
        return;
      }

      const pwd = data.defaultPassword || defaultPassword;
      setCredentialsBanner({
        title: 'Customer account created',
        name: data.user.name,
        email: data.user.email,
        password: pwd,
        planLabel: planLabel(data.user.subscriptionPlan),
      });
      setNewName('');
      setNewEmail('');
      setNewPlan('1m');
      setShowCreateForm(false);
      toast.success(`Created account for ${data.user.name}.`);
      await fetchUsers(true);
    } catch {
      toast.error('Network error while creating customer.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (target: AdminManagedUserRecord) => {
    const nextStatus: AccountStatus =
      target.status === 'active' ? 'deactivated' : 'active';
    setBusyUserId(target.id);
    try {
      const resp = await fetch(`/api/admin/users/${target.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok) {
        toast.error(data.error || 'Could not update user status.');
        return;
      }
      setConfirmToggleId(null);
      toast.success(
        nextStatus === 'deactivated'
          ? `${target.name} has been deactivated and signed out.`
          : `${target.name} has been reactivated.`
      );
      await fetchUsers(true);
    } catch {
      toast.error('Network error while updating account status.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleResetPassword = async (target: AdminManagedUserRecord) => {
    setBusyUserId(target.id);
    try {
      const resp = await fetch(`/api/admin/users/${target.id}/reset-password`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        defaultPassword?: string;
        error?: string;
      };
      if (!resp.ok) {
        toast.error(data.error || 'Could not reset password.');
        return;
      }
      const pwd = data.defaultPassword || defaultPassword;
      setConfirmResetId(null);
      setCredentialsBanner({
        title: 'Password reset to default',
        name: target.name,
        email: target.email,
        password: pwd,
        planLabel: planLabel(target.subscriptionPlan),
      });
      toast.success(
        `Reset ${target.name}'s password to ${pwd}. They must change it on next login.`
      );
      await fetchUsers(true);
    } catch {
      toast.error('Network error while resetting password.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleUpdateSubscription = async (target: AdminManagedUserRecord) => {
    setBusyUserId(target.id);
    try {
      const resp = await fetch(`/api/admin/users/${target.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subscriptionPlan: renewPlan,
          mode: target.isExpired ? 'from_now' : 'from_now',
        }),
      });
      const data = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok) {
        toast.error(data.error || 'Could not update subscription.');
        return;
      }
      setRenewTargetId(null);
      toast.success(
        `Updated ${target.name}'s plan to ${planLabel(renewPlan)}.`
      );
      await fetchUsers(true);
    } catch {
      toast.error('Network error while updating subscription.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleCopyCredentials = async () => {
    if (!credentialsBanner) return;
    const text = [
      `NeoAlgo Login Credentials`,
      `Name: ${credentialsBanner.name}`,
      `Email: ${credentialsBanner.email}`,
      `Temporary Password: ${credentialsBanner.password}`,
      `Plan: ${credentialsBanner.planLabel}`,
      `Note: You will be prompted to set a new password on your first sign-in.`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      toast.success('Credentials copied to clipboard.');
      window.setTimeout(() => setCopiedCreds(false), 1800);
    } catch {
      toast.error('Could not access clipboard.');
    }
  };

  const inputCls =
    'w-full px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 placeholder:text-slate-400 dark:placeholder:text-slate-500';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            User Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create customer accounts by subscription plan, reset passwords to{' '}
            <code className="font-mono text-xs text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-[#161D2B] px-1.5 py-0.5 rounded">
              {defaultPassword}
            </code>
            , or deactivate access anytime.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void fetchUsers(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showCreateForm ? 'Close Form' : 'Add Customer'}</span>
          </button>
        </div>
      </header>

      {/* One-Click Credentials Banner (after create or reset) */}
      {credentialsBanner && (
        <section className="bg-white dark:bg-[#111622] border border-blue-200 dark:border-blue-500/35 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 text-xs min-w-0">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {credentialsBanner.title} — {credentialsBanner.name} (
              {credentialsBanner.planLabel})
            </div>
            <div className="text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                Email:{' '}
                <code className="font-mono font-semibold text-slate-900 dark:text-slate-100 select-all">
                  {credentialsBanner.email}
                </code>
              </span>
              <span>
                Default password:{' '}
                <code className="font-mono font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15 px-1.5 py-0.5 rounded select-all">
                  {credentialsBanner.password}
                </code>
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                (Password change forced on first login)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyCredentials()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              {copiedCreds ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedCreds ? 'Copied' : 'Copy Credentials'}</span>
            </button>
            <button
              type="button"
              onClick={() => setCredentialsBanner(null)}
              aria-label="Dismiss credentials banner"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* Create Customer Account Card */}
      {showCreateForm && (
        <section className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Create New Customer Account
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Default password is{' '}
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                  {defaultPassword}
                </span>
                . The customer will be required to set a new password on first
                sign-in.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              aria-label="Close form"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={handleCreateCustomer}
            className="p-5 sm:p-6 space-y-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Customer full name
                </span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Rohan Verma"
                  className={inputCls}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Customer email
                </span>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="rohan@example.com"
                  className={inputCls}
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
                Subscription period
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {PLAN_OPTIONS.map((plan) => {
                  const selected = newPlan === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setNewPlan(plan.id)}
                      className={`px-3.5 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-blue-600/10 dark:bg-blue-500/15 border-blue-600 dark:border-blue-400 text-blue-700 dark:text-blue-300'
                          : 'bg-slate-50/70 dark:bg-[#161D2B] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="text-xs font-semibold">{plan.label}</div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                        {plan.days}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Access scope: Overview, Trades &amp; Positions, Broker
                Connection, Profile &amp; Security.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-55 rounded-lg cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {creating ? 'Creating...' : 'Create Customer Account'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* 4-Column Summary Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl divide-y lg:divide-y-0 divide-x divide-slate-200/80 dark:divide-slate-800/80 overflow-hidden">
        <div className="px-5 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Total Customers
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {stats.total}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Admin-managed accounts
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Active Plans
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {stats.active}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Currently permitted to trade
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Expiring Within 7d
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-amber-600 dark:text-amber-400">
            {stats.expiringSoon}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Due for renewal soon
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Deactivated / Expired
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-red-600 dark:text-red-400">
            {stats.inactiveOrExpired}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Blocked from sign-in
          </div>
        </div>
      </section>

      {/* Users Directory Card */}
      <section className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
            {(
              [
                { id: 'all', label: `All (${users.length})` },
                { id: 'active', label: 'Active' },
                { id: 'deactivated', label: 'Deactivated' },
                { id: 'expired', label: 'Expired' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, plan..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-[#161D2B] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-[#1B2436] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Loading user accounts...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {customers.length === 0
                ? 'No customer accounts created yet.'
                : 'No accounts match the selected filter.'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Click Add Customer to create an account with a 1M, 3M, 6M, or 1Y
              subscription and default password {defaultPassword}.
            </p>
            {customers.length === 0 && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add First Customer</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredUsers.map((u) => {
              const isOwner = u.role === 'owner';
              const isBusy = busyUserId === u.id;
              const isRenewing = renewTargetId === u.id;
              const isConfirmingReset = confirmResetId === u.id;
              const isConfirmingToggle = confirmToggleId === u.id;

              return (
                <div
                  key={u.id}
                  className="px-4 sm:px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-[#141B29]/70 transition-colors"
                >
                  {/* Left: Identity & Subscription Meta */}
                  <div className="flex items-start gap-3 min-w-0">
                    <UserAvatar
                      name={u.name}
                      avatarDataUrl={u.avatarDataUrl}
                      size="sm"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {u.name}
                        </span>
                        {isOwner ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-md bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-500/30">
                            <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                            <span>Admin</span>
                          </span>
                        ) : u.status === 'deactivated' ? (
                          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-md bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200/80 dark:border-red-500/30">
                            Deactivated
                          </span>
                        ) : u.isExpired ? (
                          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-md bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200/80 dark:border-red-500/30">
                            Expired
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-md bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/30">
                            Active
                          </span>
                        )}

                        {!isOwner && u.mustChangePassword && (
                          <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-500/30">
                            First login pending
                          </span>
                        )}

                        {u.fyersConnected && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <Wifi className="w-3 h-3" aria-hidden="true" />
                            <span>Fyers</span>
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {u.email}
                      </div>

                      {!isOwner && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span>
                            Plan:{' '}
                            <strong className="text-slate-700 dark:text-slate-200">
                              {planLabel(u.subscriptionPlan)}
                            </strong>
                          </span>
                          <span>
                            Expires:{' '}
                            <strong
                              className={
                                u.isExpired
                                  ? 'text-red-600 dark:text-red-400'
                                  : u.daysRemaining !== null &&
                                    u.daysRemaining <= 7
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-700 dark:text-slate-200'
                              }
                            >
                              {formatDateIst(u.subscriptionExpiresAt)}
                            </strong>
                            {u.daysRemaining !== null && !u.isExpired
                              ? ` (${u.daysRemaining}d left)`
                              : ''}
                          </span>
                          <span>Created {formatDateIst(u.createdAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Admin Controls (customers only) */}
                  {!isOwner && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* Renew / Update Subscription */}
                      {isRenewing ? (
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-[#161D2B] p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                          <select
                            value={renewPlan}
                            onChange={(e) =>
                              setRenewPlan(
                                e.target.value as Exclude<
                                  SubscriptionPlan,
                                  'admin'
                                >
                              )
                            }
                            aria-label="Select subscription plan"
                            className="px-2 py-1 text-xs bg-white dark:bg-[#111622] text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
                          >
                            {PLAN_OPTIONS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleUpdateSubscription(u)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenewTargetId(null)}
                            className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setRenewPlan(
                              u.subscriptionPlan === 'admin'
                                ? '1m'
                                : u.subscriptionPlan
                            );
                            setRenewTargetId(u.id);
                            setConfirmResetId(null);
                            setConfirmToggleId(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        >
                          <CalendarClock
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                          <span>Plan</span>
                        </button>
                      )}

                      {/* Reset Password to neo@123 */}
                      {isConfirmingReset ? (
                        <div className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-500/30">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleResetPassword(u)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md cursor-pointer"
                          >
                            Reset to {defaultPassword}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmResetId(null)}
                            className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setConfirmResetId(u.id);
                            setConfirmToggleId(null);
                            setRenewTargetId(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        >
                          <KeyRound
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                          <span>Reset Password</span>
                        </button>
                      )}

                      {/* Deactivate / Activate Account */}
                      {isConfirmingToggle ? (
                        <div className="inline-flex items-center gap-1.5 bg-red-50 dark:bg-red-500/10 px-2 py-1 rounded-lg border border-red-200 dark:border-red-500/30">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleToggleStatus(u)}
                            className={`px-2.5 py-1 text-xs font-semibold text-white rounded-md cursor-pointer ${
                              u.status === 'active'
                                ? 'bg-red-600 hover:bg-red-700'
                                : 'bg-emerald-600 hover:bg-emerald-700'
                            }`}
                          >
                            {u.status === 'active'
                              ? 'Confirm Deactivate'
                              : 'Confirm Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmToggleId(null)}
                            className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setConfirmToggleId(u.id);
                            setConfirmResetId(null);
                            setRenewTargetId(null);
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                            u.status === 'active'
                              ? 'text-red-600 dark:text-red-400 bg-white dark:bg-red-500/10 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/20'
                              : 'text-emerald-700 dark:text-emerald-400 bg-white dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/20'
                          }`}
                        >
                          {u.status === 'active' ? (
                            <>
                              <UserX
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                              <span>Deactivate</span>
                            </>
                          ) : (
                            <>
                              <UserCheck
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                              <span>Activate</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
