import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BrokerConnectionRecord, BrokerId } from './brokers/types';
import {
  createDefaultTelegramConfig,
  TelegramUserConfig,
} from './telegramService';

export interface SaaSUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'trader';
  passwordHash: string;
  passwordSalt: string;
  createdAt: number;
}

export interface PublicSaaSUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'trader';
  createdAt: number;
}

export interface AuthSession {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface UserWorkspaceData {
  strategyConfig: Record<string, unknown> | null;
  paperTrades: unknown[];
  savedReports: unknown[];
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

export function toPublicUser(user: SaaSUser): PublicSaaSUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

class SaaSStore {
  private users = new Map<string, SaaSUser>();
  private usersByEmail = new Map<string, SaaSUser>();
  private authSessions = new Map<string, AuthSession>();
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

  createUser(name: string, email: string, password: string): SaaSUser {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.usersByEmail.has(normalizedEmail)) {
      throw new Error('An account with this email already exists.');
    }
    const { hash, salt } = hashPassword(password);
    const user: SaaSUser = {
      id: `usr_${crypto.randomBytes(12).toString('hex')}`,
      name: name.trim(),
      email: normalizedEmail,
      role: this.users.size === 0 ? 'owner' : 'trader',
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: Date.now(),
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(normalizedEmail, user);
    this.persistUsers();
    return user;
  }

  authenticateUser(email: string, password: string): SaaSUser | null {
    const user = this.usersByEmail.get(email.trim().toLowerCase());
    if (!user) return null;
    if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      return null;
    }
    return user;
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
    return this.users.get(session.userId) ?? null;
  }

  deleteAuthSession(token: string | undefined): void {
    if (!token) return;
    if (this.authSessions.delete(token)) {
      this.persistUsers();
    }
  }

  getWorkspace(userId: string): UserWorkspaceData {
    return (
      this.workspaces.get(userId) ?? {
        strategyConfig: null,
        paperTrades: [],
        savedReports: [],
        updatedAt: 0,
      }
    );
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
      paperTrades:
        patch.paperTrades !== undefined
          ? patch.paperTrades
          : current.paperTrades,
      savedReports:
        patch.savedReports !== undefined
          ? patch.savedReports
          : current.savedReports,
      updatedAt: Date.now(),
    };
    this.workspaces.set(userId, next);
    this.persistWorkspaces();
    return next;
  }

  getBrokerConnection(
    userId: string,
    brokerId: BrokerId
  ): BrokerConnectionRecord | null {
    const map = this.brokerConnections.get(userId);
    return map?.[brokerId] ?? null;
  }

  setBrokerConnection(userId: string, record: BrokerConnectionRecord): void {
    const current = this.brokerConnections.get(userId) ?? {};
    current[record.brokerId] = record;
    this.brokerConnections.set(userId, current);
    this.persistBrokers();
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
