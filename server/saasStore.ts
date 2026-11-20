import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BrokerConnectionRecord, BrokerId } from './brokers/types';
import {
  createDefaultTelegramConfig,
  TelegramUserConfig,
} from './telegramService';

export type SubscriptionPlan = '1m' | '3m' | '6m' | '1y' | 'admin';
export type AccountStatus = 'active' | 'deactivated';

export const DEFAULT_CUSTOMER_PASSWORD = 'neo@123';

export const SUBSCRIPTION_PLAN_DAYS: Record<
  Exclude<SubscriptionPlan, 'admin'>,
  number
> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
};

export interface SaaSUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'trader';
  status?: AccountStatus;
  mustChangePassword?: boolean;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStartedAt?: number | null;
  subscriptionExpiresAt?: number | null;
  passwordHash: string;
  passwordSalt: string;
  avatarDataUrl?: string | null;
  bio?: string;
  recoveryKeyHash?: string;
  recoveryKeySalt?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface PublicSaaSUser {
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

export interface AdminManagedUser extends PublicSaaSUser {
  brokerConnected: boolean;
  connectedBrokers: BrokerId[];
}

export interface PasswordResetOtpRecord {
  codeHash: string;
  codeSalt: string;
  expiresAt: number;
  attempts: number;
  channel: 'telegram' | 'owner';
}

export interface AuthSession {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface UserOrderJournalData {
  orders: unknown[];
  positions: unknown[];
}

export interface PersistedLiveStreamState {
  active: boolean;
  symbol: string;
  optionSymbol?: string | null;
  startedAt: number;
}

export interface UserWorkspaceData {
  strategyConfig: Record<string, unknown> | null;
  perIndexConfigs?: Record<string, Record<string, unknown>>;
  paperWallet?: Record<string, unknown> | null;
  liveStreamState?: PersistedLiveStreamState | null;
  paperTrades: unknown[];
  savedReports: unknown[];
  orderJournal?: UserOrderJournalData;
  updatedAt: number;
}

interface UsersDiskFormat {
  users: SaaSUser[];
  sessions: AuthSession[];
}

type WorkspacesDiskFormat = Record<string, UserWorkspaceData>;
type BrokersDiskFormat = Record<string, Partial<Record<BrokerId, BrokerConnectionRecord>>>;
type TelegramDiskFormat = Record<string, TelegramUserConfig>;

const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const BROKER_SESSION_MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

function getDataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  return path.resolve(process.cwd(), configured || 'data');
}

function ensureDataDir(): string {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

function atomicWriteFile(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const tmpPath = `${targetPath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, content, { mode: 0o600 });
  fs.renameSync(tmpPath, targetPath);
}

function getOrCreateMasterKey(): Buffer {
  const envSecret =
    process.env.SESSION_SECRET?.trim() ||
    process.env.FYERS_SECRET_ID?.trim();
  if (envSecret && envSecret !== 'CHANGE_ME_TO_A_RANDOM_64_CHAR_HEX_STRING' && envSecret !== 'MY_FYERS_SECRET_ID') {
    return crypto
      .createHash('sha256')
      .update(`neoalgo-vps-master:${envSecret}`)
      .digest();
  }

  // Persistent auto-generated local key for zero-config AWS VPS bootstrapping
  const keyFile = path.resolve(process.cwd(), '.server_master.key');
  try {
    if (fs.existsSync(keyFile)) {
      const hex = fs.readFileSync(keyFile, 'utf8').trim();
      if (hex.length >= 64) {
        return Buffer.from(hex.slice(0, 64), 'hex');
      }
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, generated.toString('hex'), { mode: 0o600 });
    return generated;
  } catch {
    return crypto
      .createHash('sha256')
      .update(`neoalgo-fallback:${process.cwd()}`)
      .digest();
  }
}

function encryptJson(value: unknown, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(value);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptJson<T>(raw: string, key: Buffer): T | null {
  try {
    const parsed = JSON.parse(raw) as {
      iv?: string;
      tag?: string;
      data?: string;
    };
    if (!parsed.iv || !parsed.tag || !parsed.data) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(parsed.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifyPassword(
  password: string,
  hash: string,
  salt: string
): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

export function generateRecoveryKeyString(): string {
  const bytes = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `NA-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(
    8,
    12
  )}-${bytes.slice(12, 16)}`;
}

export function normalizeRecoveryKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function toPublicUser(user: SaaSUser): PublicSaaSUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status === 'deactivated' ? 'deactivated' : 'active',
    mustChangePassword: Boolean(user.mustChangePassword),
    subscriptionPlan:
      user.subscriptionPlan || (user.role === 'owner' ? 'admin' : '1m'),
    subscriptionStartedAt:
      user.subscriptionStartedAt !== undefined
        ? user.subscriptionStartedAt
        : user.createdAt,
    subscriptionExpiresAt:
      user.role === 'owner'
        ? null
        : user.subscriptionExpiresAt !== undefined
        ? user.subscriptionExpiresAt
        : null,
    avatarDataUrl: user.avatarDataUrl ?? null,
    bio: user.bio ?? '',
    hasRecoveryKey: Boolean(user.recoveryKeyHash && user.recoveryKeySalt),
    createdAt: user.createdAt,
  };
}

class SaaSStore {
  private users = new Map<string, SaaSUser>();
  private usersByEmail = new Map<string, SaaSUser>();
  private authSessions = new Map<string, AuthSession>();
  private passwordResetOtps = new Map<string, PasswordResetOtpRecord>();
  private workspaces = new Map<string, UserWorkspaceData>();
  private brokerConnections = new Map<
    string,
    Partial<Record<BrokerId, BrokerConnectionRecord>>
  >();
  private telegramConfigs = new Map<string, TelegramUserConfig>();
  private masterKey: Buffer;
  private initialized = false;

  constructor() {
    this.masterKey = getOrCreateMasterKey();
  }

  private get usersFilePath(): string {
    return path.join(getDataDir(), 'neoalgo_users.json');
  }

  private get workspacesFilePath(): string {
    return path.join(getDataDir(), 'neoalgo_workspaces.json');
  }

  private get brokersFilePath(): string {
    return path.join(getDataDir(), 'neoalgo_brokers.enc.json');
  }

  private get telegramFilePath(): string {
    return path.join(getDataDir(), 'neoalgo_telegram.enc.json');
  }

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    ensureDataDir();
    this.masterKey = getOrCreateMasterKey();

    // Load users & auth sessions
    if (fs.existsSync(this.usersFilePath)) {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(this.usersFilePath, 'utf8')
        ) as UsersDiskFormat;
        for (const u of parsed.users || []) {
          if (u?.id && u?.email) {
            this.users.set(u.id, u);
            this.usersByEmail.set(u.email.toLowerCase(), u);
          }
        }
        const now = Date.now();
        for (const s of parsed.sessions || []) {
          if (s?.token && s?.userId && s.expiresAt > now) {
            this.authSessions.set(s.token, s);
          }
        }
      } catch (err) {
        console.warn('Could not load SaaS users file:', err);
      }
    }

    // Load per-user workspaces
    if (fs.existsSync(this.workspacesFilePath)) {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(this.workspacesFilePath, 'utf8')
        ) as WorkspacesDiskFormat;
        for (const [uid, ws] of Object.entries(parsed || {})) {
          if (ws) this.workspaces.set(uid, ws);
        }
      } catch (err) {
        console.warn('Could not load SaaS workspaces file:', err);
      }
    }

    // Load encrypted per-user broker connections
    if (fs.existsSync(this.brokersFilePath)) {
      try {
        const raw = fs.readFileSync(this.brokersFilePath, 'utf8');
        const parsed = decryptJson<BrokersDiskFormat>(raw, this.masterKey);
        if (parsed) {
          const cutoff = Date.now() - BROKER_SESSION_MAX_AGE_MS;
          for (const [uid, map] of Object.entries(parsed)) {
            const validMap: Partial<Record<BrokerId, BrokerConnectionRecord>> =
              {};
            for (const [bId, rec] of Object.entries(map || {})) {
              if (rec?.accessToken && (rec.connectedAt ?? 0) >= cutoff) {
                validMap[bId as BrokerId] = rec;
              }
            }
            if (Object.keys(validMap).length > 0) {
              this.brokerConnections.set(uid, validMap);
            }
          }
        }
      } catch (err) {
        console.warn('Could not load encrypted broker vault:', err);
      }
    }

    // Load encrypted per-user Telegram alert configurations
    if (fs.existsSync(this.telegramFilePath)) {
      try {
        const raw = fs.readFileSync(this.telegramFilePath, 'utf8');
        const parsed = decryptJson<TelegramDiskFormat>(raw, this.masterKey);
        if (parsed) {
          for (const [uid, cfg] of Object.entries(parsed)) {
            if (cfg && typeof cfg === 'object') {
              this.telegramConfigs.set(uid, {
                ...createDefaultTelegramConfig(),
                ...cfg,
              });
            }
          }
        }
      } catch (err) {
        console.warn('Could not load encrypted Telegram alert vault:', err);
      }
    }
  }

  private persistUsers(): void {
    const now = Date.now();
    const activeSessions = Array.from(this.authSessions.values()).filter(
      (s) => s.expiresAt > now
    );
    const payload: UsersDiskFormat = {
      users: Array.from(this.users.values()),
      sessions: activeSessions,
    };
    atomicWriteFile(this.usersFilePath, JSON.stringify(payload, null, 2));
  }

  private persistWorkspaces(): void {
    const payload: WorkspacesDiskFormat = Object.fromEntries(
      this.workspaces.entries()
    );
    atomicWriteFile(this.workspacesFilePath, JSON.stringify(payload));
  }

  private persistBrokers(): void {
    const payload: BrokersDiskFormat = Object.fromEntries(
      this.brokerConnections.entries()
    );
    atomicWriteFile(
      this.brokersFilePath,
      encryptJson(payload, this.masterKey)
    );
  }

  private persistTelegram(): void {
    const payload: TelegramDiskFormat = Object.fromEntries(
      this.telegramConfigs.entries()
    );
    atomicWriteFile(
      this.telegramFilePath,
      encryptJson(payload, this.masterKey)
    );
  }

  getUserCount(): number {
    return this.users.size;
  }

  getUserById(userId: string): SaaSUser | null {
    return this.users.get(userId) ?? null;
  }

  getUserByEmail(email: string): SaaSUser | null {
    return this.usersByEmail.get(email.trim().toLowerCase()) ?? null;
  }

  listPublicUsers(): PublicSaaSUser[] {
    return Array.from(this.users.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toPublicUser);
  }

  listAdminUsers(): AdminManagedUser[] {
    return Array.from(this.users.values())
      .sort((a, b) => {
        if (a.role === 'owner' && b.role !== 'owner') return -1;
        if (b.role === 'owner' && a.role !== 'owner') return 1;
        return b.createdAt - a.createdAt;
      })
      .map((u) => {
        const brokersMap = this.brokerConnections.get(u.id) || {};
        const connectedBrokers = Object.keys(brokersMap) as BrokerId[];
        return {
          ...toPublicUser(u),
          brokerConnected: connectedBrokers.length > 0,
          connectedBrokers,
        };
      });
  }

  private revokeUserSessions(userId: string): void {
    for (const [tok, sess] of this.authSessions.entries()) {
      if (sess.userId === userId) {
        this.authSessions.delete(tok);
      }
    }
  }

  createUser(
    name: string,
    email: string,
    password: string
  ): { user: SaaSUser; recoveryKey: string } {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.usersByEmail.has(normalizedEmail)) {
      throw new Error('An account with this email already exists.');
    }
    const { hash, salt } = hashPassword(password);
    const recoveryKey = generateRecoveryKeyString();
    const rec = hashPassword(normalizeRecoveryKey(recoveryKey));
    const now = Date.now();
    const isOwner = this.users.size === 0;
    const user: SaaSUser = {
      id: `usr_${crypto.randomBytes(12).toString('hex')}`,
      name: name.trim(),
      email: normalizedEmail,
      role: isOwner ? 'owner' : 'trader',
      status: 'active',
      mustChangePassword: false,
      subscriptionPlan: isOwner ? 'admin' : '1m',
      subscriptionStartedAt: now,
      subscriptionExpiresAt: isOwner
        ? null
        : now + SUBSCRIPTION_PLAN_DAYS['1m'] * 24 * 60 * 60 * 1000,
      passwordHash: hash,
      passwordSalt: salt,
      avatarDataUrl: null,
      bio: '',
      recoveryKeyHash: rec.hash,
      recoveryKeySalt: rec.salt,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(normalizedEmail, user);
    this.persistUsers();
    return { user, recoveryKey };
  }

  createCustomerByAdmin(params: {
    name: string;
    email: string;
    subscriptionPlan: Exclude<SubscriptionPlan, 'admin'>;
  }): { user: SaaSUser; defaultPassword: string } {
    const normalizedEmail = params.email.trim().toLowerCase();
    if (this.usersByEmail.has(normalizedEmail)) {
      throw new Error('An account with this email already exists.');
    }
    const planDays = SUBSCRIPTION_PLAN_DAYS[params.subscriptionPlan] || 30;
    const { hash, salt } = hashPassword(DEFAULT_CUSTOMER_PASSWORD);
    const recoveryKey = generateRecoveryKeyString();
    const rec = hashPassword(normalizeRecoveryKey(recoveryKey));
    const now = Date.now();
    const user: SaaSUser = {
      id: `usr_${crypto.randomBytes(12).toString('hex')}`,
      name: params.name.trim(),
      email: normalizedEmail,
      role: 'trader',
      status: 'active',
      mustChangePassword: true,
      subscriptionPlan: params.subscriptionPlan,
      subscriptionStartedAt: now,
      subscriptionExpiresAt: now + planDays * 24 * 60 * 60 * 1000,
      passwordHash: hash,
      passwordSalt: salt,
      avatarDataUrl: null,
      bio: '',
      recoveryKeyHash: rec.hash,
      recoveryKeySalt: rec.salt,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(normalizedEmail, user);
    this.persistUsers();
    return { user, defaultPassword: DEFAULT_CUSTOMER_PASSWORD };
  }

  setUserStatusByAdmin(
    targetUserId: string,
    status: AccountStatus
  ): { ok: boolean; user?: SaaSUser; error?: string } {
    const user = this.users.get(targetUserId);
    if (!user) return { ok: false, error: 'User not found.' };
    if (user.role === 'owner') {
      return { ok: false, error: 'Admin account cannot be deactivated.' };
    }
    user.status = status;
    user.updatedAt = Date.now();
    if (status === 'deactivated') {
      this.revokeUserSessions(user.id);
    }
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email.toLowerCase(), user);
    this.persistUsers();
    return { ok: true, user };
  }

  resetUserPasswordToDefaultByAdmin(
    targetUserId: string
  ): { ok: boolean; user?: SaaSUser; defaultPassword?: string; error?: string } {
    const user = this.users.get(targetUserId);
    if (!user) return { ok: false, error: 'User not found.' };
    if (user.role === 'owner') {
      return {
        ok: false,
        error: 'Use Account Security settings to change the Admin password.',
      };
    }
    const { hash, salt } = hashPassword(DEFAULT_CUSTOMER_PASSWORD);
    user.passwordHash = hash;
    user.passwordSalt = salt;
    user.mustChangePassword = true;
    user.updatedAt = Date.now();
    this.revokeUserSessions(user.id);
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email.toLowerCase(), user);
    this.persistUsers();
    return { ok: true, user, defaultPassword: DEFAULT_CUSTOMER_PASSWORD };
  }

  updateUserSubscriptionByAdmin(
    targetUserId: string,
    plan: Exclude<SubscriptionPlan, 'admin'>,
    mode: 'from_now' | 'extend' = 'from_now'
  ): { ok: boolean; user?: SaaSUser; error?: string } {
    const user = this.users.get(targetUserId);
    if (!user) return { ok: false, error: 'User not found.' };
    if (user.role === 'owner') {
      return { ok: false, error: 'Admin account does not expire.' };
    }
    const planDays = SUBSCRIPTION_PLAN_DAYS[plan] || 30;
    const now = Date.now();
    const baseTime =
      mode === 'extend' &&
      user.subscriptionExpiresAt &&
      user.subscriptionExpiresAt > now
        ? user.subscriptionExpiresAt
        : now;
    user.subscriptionPlan = plan;
    user.subscriptionStartedAt = now;
    user.subscriptionExpiresAt = baseTime + planDays * 24 * 60 * 60 * 1000;
    user.updatedAt = now;
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email.toLowerCase(), user);
    this.persistUsers();
    return { ok: true, user };
  }

  authenticateUser(email: string, password: string): SaaSUser | null {
    const res = this.authenticateUserDetailed(email, password);
    return res.ok && res.user ? res.user : null;
  }

  authenticateUserDetailed(
    email: string,
    password: string
  ): { ok: boolean; user?: SaaSUser; error?: string; code?: number } {
    const user = this.usersByEmail.get(email.trim().toLowerCase());
    if (!user) {
      return { ok: false, error: 'Invalid email or password.', code: 401 };
    }
    if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      return { ok: false, error: 'Invalid email or password.', code: 401 };
    }
    if (user.status === 'deactivated') {
      return {
        ok: false,
        error:
          'Your account has been deactivated. Please contact your administrator.',
        code: 403,
      };
    }
    if (
      user.role !== 'owner' &&
      typeof user.subscriptionExpiresAt === 'number' &&
      user.subscriptionExpiresAt <= Date.now()
    ) {
      return {
        ok: false,
        error:
          'Your subscription period has expired. Please contact your administrator to renew.',
        code: 403,
      };
    }
    return { ok: true, user };
  }

  updateUserProfile(
    userId: string,
    patch: { name?: string; bio?: string; avatarDataUrl?: string | null }
  ): SaaSUser | null {
    const user = this.users.get(userId);
    if (!user) return null;
    if (typeof patch.name === 'string' && patch.name.trim().length >= 2) {
      user.name = patch.name.trim().slice(0, 80);
    }
    if (typeof patch.bio === 'string') {
      user.bio = patch.bio.trim().slice(0, 140);
    }
    if (patch.avatarDataUrl !== undefined) {
      user.avatarDataUrl = patch.avatarDataUrl;
    }
    user.updatedAt = Date.now();
    this.users.set(userId, user);
    this.usersByEmail.set(user.email.toLowerCase(), user);
    this.persistUsers();
    return user;
  }

  changeUserPassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): { ok: boolean; user?: SaaSUser; error?: string } {
    const user = this.users.get(userId);
    if (!user) return { ok: false, error: 'Account not found.' };
    if (!verifyPassword(currentPassword, user.passwordHash, user.passwordSalt)) {
      return { ok: false, error: 'Current password is incorrect.' };
    }
    if (
      user.mustChangePassword &&
      newPassword.trim() === DEFAULT_CUSTOMER_PASSWORD
    ) {
      return {
        ok: false,
        error:
          'Please choose a personal password different from the default password (neo@123).',
      };
    }
    const { hash, salt } = hashPassword(newPassword);
    user.passwordHash = hash;
    user.passwordSalt = salt;
    user.mustChangePassword = false;
    user.updatedAt = Date.now();
    this.users.set(userId, user);
    this.usersByEmail.set(user.email.toLowerCase(), user);
    this.persistUsers();
    return { ok: true, user };
  }

  regenerateRecoveryKey(userId: string): string | null {
    const user = this.users.get(userId);
    if (!user) return null;
    const recoveryKey = generateRecoveryKeyString();
    const rec = hashPassword(normalizeRecoveryKey(recoveryKey));
    user.recoveryKeyHash = rec.hash;
    user.recoveryKeySalt = rec.salt;
    user.updatedAt = Date.now();
    this.users.set(userId, user);
    this.usersByEmail.set(user.email.toLowerCase(), user);
    this.persistUsers();
    return recoveryKey;
  }

  createPasswordResetOtp(
    userId: string,
    channel: 'telegram' | 'owner',
    ttlMs = 15 * 60 * 1000
  ): string {
    const code = String(crypto.randomInt(100000, 1000000));
    const { hash, salt } = hashPassword(code);
    this.passwordResetOtps.set(userId, {
      codeHash: hash,
      codeSalt: salt,
      expiresAt: Date.now() + ttlMs,
      attempts: 0,
      channel,
    });
    return code;
  }

  resetPasswordViaRecovery(
    email: string,
    credential: { recoveryKey?: string; otpCode?: string },
    newPassword: string
  ): { ok: boolean; user?: SaaSUser; nextRecoveryKey?: string; error?: string } {
    const user = this.usersByEmail.get(email.trim().toLowerCase());
    if (!user) {
      return { ok: false, error: 'Invalid email or recovery credentials.' };
    }

    let verified = false;
    let rotateRecoveryKey = false;

    if (credential.recoveryKey && credential.recoveryKey.trim()) {
      if (user.recoveryKeyHash && user.recoveryKeySalt) {
        verified = verifyPassword(
          normalizeRecoveryKey(credential.recoveryKey),
          user.recoveryKeyHash,
          user.recoveryKeySalt
        );
        if (verified) rotateRecoveryKey = true;
      }
      if (!verified) {
        return { ok: false, error: 'Recovery key does not match this account.' };
      }
    } else if (credential.otpCode && credential.otpCode.trim()) {
      const record = this.passwordResetOtps.get(user.id);
      if (!record || record.expiresAt <= Date.now()) {
        this.passwordResetOtps.delete(user.id);
        return {
          ok: false,
          error: 'Reset code expired or not requested. Request a new 6-digit code.',
        };
      }
      if (record.attempts >= 5) {
        this.passwordResetOtps.delete(user.id);
        return {
          ok: false,
          error: 'Too many invalid attempts. Request a new reset code.',
        };
      }
      record.attempts += 1;
      const cleanOtp = credential.otpCode.trim().replace(/\s+/g, '');
      verified = verifyPassword(cleanOtp, record.codeHash, record.codeSalt);
      if (!verified) {
        return { ok: false, error: 'Invalid 6-digit reset code.' };
      }
      this.passwordResetOtps.delete(user.id);
    } else {
      return {
        ok: false,
        error: 'Provide either your Recovery Key or a 6-digit Reset Code.',
      };
    }

    const { hash, salt } = hashPassword(newPassword);
    user.passwordHash = hash;
    user.passwordSalt = salt;

    let nextRecoveryKey: string | undefined;
    if (rotateRecoveryKey || !user.recoveryKeyHash) {
      nextRecoveryKey = generateRecoveryKeyString();
      const rec = hashPassword(normalizeRecoveryKey(nextRecoveryKey));
      user.recoveryKeyHash = rec.hash;
      user.recoveryKeySalt = rec.salt;
    }

    user.updatedAt = Date.now();
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email.toLowerCase(), user);

    // Revoke all old sessions for this user upon password reset
    for (const [tok, sess] of this.authSessions.entries()) {
      if (sess.userId === user.id) {
        this.authSessions.delete(tok);
      }
    }

    this.persistUsers();
    return { ok: true, user, nextRecoveryKey };
  }

  createAuthSession(userId: string): AuthSession {
    const now = Date.now();
    const session: AuthSession = {
      token: crypto.randomBytes(32).toString('hex'),
      userId,
      createdAt: now,
      expiresAt: now + AUTH_SESSION_TTL_MS,
    };
    this.authSessions.set(session.token, session);
    this.persistUsers();
    return session;
  }

  getUserBySessionToken(token: string | undefined): SaaSUser | null {
    if (!token) return null;
    const session = this.authSessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.authSessions.delete(token);
      this.persistUsers();
      return null;
    }
    const user = this.users.get(session.userId) ?? null;
    if (!user) return null;
    if (user.status === 'deactivated') {
      this.authSessions.delete(token);
      this.persistUsers();
      return null;
    }
    if (
      user.role !== 'owner' &&
      typeof user.subscriptionExpiresAt === 'number' &&
      user.subscriptionExpiresAt <= Date.now()
    ) {
      this.authSessions.delete(token);
      this.persistUsers();
      return null;
    }
    return user;
  }

  deleteAuthSession(token: string | undefined): void {
    if (!token) return;
    if (this.authSessions.delete(token)) {
      this.persistUsers();
    }
  }

  getWorkspace(userId: string): UserWorkspaceData {
    const stored = this.workspaces.get(userId);
    if (!stored) {
      return {
        strategyConfig: null,
        perIndexConfigs: {},
        paperWallet: null,
        liveStreamState: null,
        paperTrades: [],
        savedReports: [],
        orderJournal: { orders: [], positions: [] },
        updatedAt: 0,
      };
    }
    return {
      ...stored,
      perIndexConfigs: stored.perIndexConfigs ?? {},
      paperWallet: stored.paperWallet ?? null,
      liveStreamState: stored.liveStreamState ?? null,
      orderJournal: stored.orderJournal ?? { orders: [], positions: [] },
    };
  }

  updateWorkspace(
    userId: string,
    patch: Partial<Omit<UserWorkspaceData, 'updatedAt'>>
  ): UserWorkspaceData {
    const current = this.getWorkspace(userId);
    const next: UserWorkspaceData = {
      strategyConfig:
        patch.strategyConfig !== undefined
          ? patch.strategyConfig
          : current.strategyConfig,
      perIndexConfigs:
        patch.perIndexConfigs !== undefined
          ? patch.perIndexConfigs
          : current.perIndexConfigs ?? {},
      paperWallet:
        patch.paperWallet !== undefined
          ? patch.paperWallet
          : current.paperWallet ?? null,
      liveStreamState:
        patch.liveStreamState !== undefined
          ? patch.liveStreamState
          : current.liveStreamState ?? null,
      paperTrades:
        patch.paperTrades !== undefined
          ? patch.paperTrades
          : current.paperTrades,
      savedReports:
        patch.savedReports !== undefined
          ? patch.savedReports
          : current.savedReports,
      orderJournal:
        patch.orderJournal !== undefined
          ? patch.orderJournal
          : current.orderJournal ?? { orders: [], positions: [] },
      updatedAt: Date.now(),
    };
    this.workspaces.set(userId, next);
    this.persistWorkspaces();
    return next;
  }

  getAllActiveLiveStreams(): Array<{
    userId: string;
    state: PersistedLiveStreamState;
  }> {
    const result: Array<{ userId: string; state: PersistedLiveStreamState }> = [];
    for (const [userId, ws] of this.workspaces.entries()) {
      if (ws.liveStreamState && ws.liveStreamState.active && ws.liveStreamState.symbol) {
        result.push({ userId, state: ws.liveStreamState });
      }
    }
    return result;
  }

  getBrokerConnection(
    userId: string,
    brokerId: BrokerId
  ): BrokerConnectionRecord | null {
    const map = this.brokerConnections.get(userId);
    return map?.[brokerId] ?? null;
  }

  getAllBrokerConnections(
    brokerId: BrokerId
  ): Array<{ userId: string; connection: BrokerConnectionRecord }> {
    const out: Array<{ userId: string; connection: BrokerConnectionRecord }> = [];
    for (const [userId, map] of this.brokerConnections.entries()) {
      const conn = map?.[brokerId];
      if (conn) {
        out.push({ userId, connection: conn });
      }
    }
    return out;
  }

  setBrokerConnection(userId: string, record: BrokerConnectionRecord): void {
    const current = this.brokerConnections.get(userId) ?? {};
    const existing = current[record.brokerId];
    // Preserve saved PIN across OAuth reconnections unless explicitly overwritten
    const merged: BrokerConnectionRecord = {
      ...record,
      pin: record.pin !== undefined ? record.pin : existing?.pin,
    };
    current[record.brokerId] = merged;
    this.brokerConnections.set(userId, current);
    this.persistBrokers();
  }

  updateBrokerPin(
    userId: string,
    brokerId: BrokerId,
    pin: string | null
  ): BrokerConnectionRecord | null {
    const current = this.brokerConnections.get(userId);
    const existing = current?.[brokerId];
    if (!existing) return null;
    if (pin && pin.trim()) {
      existing.pin = pin.trim();
    } else {
      delete existing.pin;
    }
    this.brokerConnections.set(userId, current);
    this.persistBrokers();
    return existing;
  }

  removeBrokerConnection(userId: string, brokerId: BrokerId): void {
    const current = this.brokerConnections.get(userId);
    if (!current || !current[brokerId]) return;
    delete current[brokerId];
    if (Object.keys(current).length === 0) {
      this.brokerConnections.delete(userId);
    } else {
      this.brokerConnections.set(userId, current);
    }
    this.persistBrokers();
  }

  getTelegramConfig(userId: string): TelegramUserConfig {
    return (
      this.telegramConfigs.get(userId) ?? createDefaultTelegramConfig()
    );
  }

  setTelegramConfig(
    userId: string,
    config: TelegramUserConfig
  ): TelegramUserConfig {
    const saved: TelegramUserConfig = {
      ...config,
      updatedAt: Date.now(),
    };
    this.telegramConfigs.set(userId, saved);
    this.persistTelegram();
    return saved;
  }
}

export const saasStore = new SaaSStore();
