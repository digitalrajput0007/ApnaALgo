import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  Shield,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { SaaSAuthController, SaaSUser } from '../hooks/useSaaSAuth';
import { StrategyConfig } from '../types/strategy';
import { ModificationGuide } from './ModificationGuide';
import { NeoAlgoCodeView } from './NeoAlgoCodeView';
import { UserAvatar } from './UserAvatar';

export type SettingsSection = 'profile' | 'security' | 'developer';

interface SettingsViewProps {
  auth: SaaSAuthController;
  initialSection?: SettingsSection;
  strategyConfig: StrategyConfig;
  onDownloadPython: () => void;
  onGoToIntegrations: () => void;
}

function compressAvatarToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable.'));
          return;
        }
        // Center-crop to square
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  auth,
  initialSection = 'profile',
  strategyConfig,
  onDownloadPython,
  onGoToIntegrations,
}) => {
  const user = auth.user!;
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [devSubTab, setDevSubTab] = useState<'code' | 'guide'>('code');

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  // Profile form state
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user.avatarDataUrl
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(user.name);
    setBio(user.bio || '');
    setAvatarPreview(user.avatarDataUrl);
  }, [user.name, user.bio, user.avatarDataUrl]);

  const profileDirty =
    name.trim() !== user.name ||
    bio.trim() !== (user.bio || '') ||
    avatarPreview !== user.avatarDataUrl;

  const handleAvatarFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image file is too large (max 10 MB).');
      return;
    }
    try {
      const dataUrl = await compressAvatarToDataUrl(file);
      setAvatarPreview(dataUrl);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to process image.'
      );
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error('Full name must be at least 2 characters.');
      return;
    }
    setSavingProfile(true);
    const res = await auth.updateProfile({
      name: name.trim(),
      bio: bio.trim(),
      avatarDataUrl: avatarPreview,
    });
    setSavingProfile(false);
    if (res.ok) {
      toast.success('Profile updated.');
    } else {
      toast.error(res.error || 'Could not update profile.');
    }
  };

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }
    setChangingPassword(true);
    const res = await auth.changePassword(currentPassword, newPassword);
    setChangingPassword(false);
    if (res.ok) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully.');
    } else {
      toast.error(res.error || 'Could not change password.');
    }
  };

  // Recovery key state
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [regeneratingKey, setRegeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const handleRegenerateKey = async () => {
    setRegeneratingKey(true);
    const res = await auth.regenerateRecoveryKey();
    setRegeneratingKey(false);
    if (res.ok && res.recoveryKey) {
      setGeneratedKey(res.recoveryKey);
      toast.success('New recovery key generated. Save it in a safe place.');
    } else {
      toast.error(res.error || 'Could not generate recovery key.');
    }
  };

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(true);
      toast.success('Recovery key copied to clipboard.');
      setTimeout(() => setCopiedKey(false), 1800);
    } catch {
      toast.error('Could not access clipboard.');
    }
  };

  const handleDownloadKeyFile = (key: string) => {
    const content = [
      'NeoAlgo Account Recovery Key',
      `Account: ${user.email}`,
      `Recovery Key: ${key}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Store this file securely. Use this key on the Sign In -> Forgot Password screen to reset your password.',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neoalgo-recovery-key-${user.email.split('@')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Owner Team Recovery state
  const [teamUsers, setTeamUsers] = useState<SaaSUser[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [issuedResetCodes, setIssuedResetCodes] = useState<
    Record<string, { code: string; expiresInMinutes: number }>
  >({});

  useEffect(() => {
    if (section !== 'security' || user.role !== 'owner') return;
    let cancelled = false;
    setLoadingTeam(true);
    fetch('/api/account/team', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { users?: SaaSUser[] } | null) => {
        if (!cancelled && Array.isArray(data?.users)) {
          setTeamUsers(data.users);
        }
      })
      .catch(() => {
        // ignore
      })
      .finally(() => {
        if (!cancelled) setLoadingTeam(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, user.role]);

  const handleIssueTeamResetCode = async (target: SaaSUser) => {
    try {
      const resp = await fetch(`/api/account/team/${target.id}/reset-code`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await resp.json()) as {
        code?: string;
        expiresInMinutes?: number;
        error?: string;
      };
      if (!resp.ok || !data.code) {
        toast.error(data.error || 'Could not issue reset code.');
        return;
      }
      setIssuedResetCodes((prev) => ({
        ...prev,
        [target.id]: {
          code: data.code!,
          expiresInMinutes: data.expiresInMinutes ?? 15,
        },
      }));
      toast.success(`Issued 15-min reset code for ${target.email}.`);
    } catch {
      toast.error('Network error while generating reset code.');
    }
  };

  const joinedLabel = new Date(user.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const navItems: {
    id: SettingsSection;
    label: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Password & Recovery', icon: Shield },
    { id: 'developer', label: 'Developer Export', icon: Code2 },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Settings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your profile, account security, password recovery, and Python
            exports.
          </p>
        </div>

        {/* Clean Segmented Section Tabs */}
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* SECTION 1: PROFILE & AVATAR */}
      {section === 'profile' && (
        <div className="max-w-3xl bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Profile Details
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Personalize how your account appears across your workspace.
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="p-6 space-y-6">
            {/* Profile Picture Uploader */}
            <div className="flex flex-wrap items-center gap-5">
              <div className="relative group">
                <UserAvatar
                  name={name || user.name}
                  avatarDataUrl={avatarPreview}
                  size="xl"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Upload profile photo"
                  className="absolute inset-0 rounded-full bg-slate-900/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                >
                  <Camera className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-900">
                  Profile picture
                </div>
                <p className="text-xs text-slate-500">
                  PNG, JPG, or WebP. Automatically cropped to a crisp square.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => void handleAvatarFileChange(e)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{avatarPreview ? 'Change photo' : 'Upload photo'}</span>
                  </button>

                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={() => setAvatarPreview(null)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
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
                  className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">
                  Email address
                </span>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full px-3.5 py-2 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg cursor-not-allowed"
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-700">
                Trading focus / headline
              </span>
              <input
                type="text"
                maxLength={140}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="e.g. NIFTY 5m Intraday Momentum & Index Options"
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
              />
            </label>

            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                Role:{' '}
                <span className="font-medium text-slate-800 capitalize">
                  {user.role}
                </span>{' '}
                · Member since{' '}
                <span className="font-mono tabular-nums text-slate-700">
                  {joinedLabel}
                </span>
              </div>

              <button
                type="submit"
                disabled={savingProfile || !profileDirty}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-45 rounded-lg transition-colors cursor-pointer"
              >
                {savingProfile ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SECTION 2: SECURITY, PASSWORD CHANGE & RECOVERY */}
      {section === 'security' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* Change Password */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Change Password
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update your account password anytime.
                </p>
              </div>
              <Lock className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </div>

            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">
                  Current password
                </span>
                <div className="relative">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full px-3.5 py-2 pr-10 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords((s) => !s)}
                    aria-label={
                      showPasswords ? 'Hide passwords' : 'Show passwords'
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPasswords ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">
                  New password
                </span>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-700">
                  Confirm new password
                </span>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                />
              </label>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {changingPassword ? 'Updating...' : 'Update password'}
                </button>
              </div>
            </form>
          </section>

          {/* Password Recovery Key & Telegram OTP Info */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Password Recovery
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Recover access anytime from the Sign In page without relying
                  on email servers.
                </p>
              </div>
              <KeyRound
                className="w-4 h-4 text-slate-400"
                aria-hidden="true"
              />
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">
                    Account Recovery Key
                  </span>
                  <span className="text-emerald-700 font-medium">
                    {user.hasRecoveryKey ? 'Active' : 'Not set'}
                  </span>
                </div>
                <p className="text-slate-500 leading-relaxed">
                  Stored securely as a one-way cryptographic hash. Generate a
                  new key if you haven’t backed up your current key yet.
                </p>

                {generatedKey && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                    <div className="font-mono text-sm font-semibold text-slate-900 tracking-wide select-all">
                      {generatedKey}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyKey(generatedKey)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
                      >
                        {copiedKey ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedKey ? 'Copied' : 'Copy key'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadKeyFile(generatedKey)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download .txt</span>
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={regeneratingKey}
                  onClick={() => void handleRegenerateKey()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      regeneratingKey ? 'animate-spin' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    {user.hasRecoveryKey
                      ? 'Generate new recovery key'
                      : 'Create recovery key'}
                  </span>
                </button>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-1.5">
                <div className="font-semibold text-slate-900">
                  Telegram 6-Digit OTP Recovery
                </div>
                <p className="text-slate-500 leading-relaxed">
                  When a Personal DM destination is enabled in{' '}
                  <button
                    type="button"
                    onClick={onGoToIntegrations}
                    className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    Integrations → Telegram Alerts
                  </button>
                  , you can also request a 6-digit password reset code directly
                  in Telegram from the Sign In screen.
                </p>
              </div>
            </div>
          </section>

          {/* Owner-Only Team Recovery Panel */}
          {user.role === 'owner' && (
            <section className="xl:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Workspace Users &amp; Owner Reset Codes
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    As workspace owner, you can issue a single-use 15-minute
                    6-digit reset code if a user loses both their password and
                    recovery key.
                  </p>
                </div>
                <Users
                  className="w-4 h-4 text-slate-400 shrink-0"
                  aria-hidden="true"
                />
              </div>

              {loadingTeam ? (
                <div className="px-6 py-6 text-xs text-slate-500">
                  Loading workspace members...
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {teamUsers.map((member) => {
                    const issued = issuedResetCodes[member.id];
                    return (
                      <div
                        key={member.id}
                        className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            name={member.name}
                            avatarDataUrl={member.avatarDataUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate">
                              {member.name}{' '}
                              <span className="font-normal text-slate-400 capitalize">
                                · {member.role}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              {member.email}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {issued && (
                            <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md select-all">
                              Code: {issued.code} ({issued.expiresInMinutes}m)
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleIssueTeamResetCode(member)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                          >
                            Issue 6-digit reset code
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* SECTION 3: DEVELOPER EXPORT (Python Code + Modification Guide) */}
      {section === 'developer' && (
        <div className="space-y-5">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setDevSubTab('code')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                devSubTab === 'code'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Python Strategy Script
            </button>
            <button
              type="button"
              onClick={() => setDevSubTab('guide')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                devSubTab === 'guide'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Modification Guide
            </button>
          </div>

          {devSubTab === 'code' ? (
            <NeoAlgoCodeView
              config={strategyConfig}
              onDownloadPython={onDownloadPython}
            />
          ) : (
            <ModificationGuide
              config={strategyConfig}
              onJumpToCode={() => setDevSubTab('code')}
            />
          )}
        </div>
      )}
    </div>
  );
};
