import crypto from 'crypto';
import dns from 'dns';
import dotenv from 'dotenv';
import express, { CookieOptions, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import { BROKER_CATALOG } from './server/brokers/registry';
import {
  BrokerConnectionRecord,
  BrokerId,
  BrokerProfile,
  BrokerPublicStatus,
} from './server/brokers/types';
import { PublicSaaSUser, saasStore, toPublicUser } from './server/saasStore';
import {
  DEFAULT_TELEGRAM_TRIGGERS,
  discoverTelegramChats,
  formatTelegramAlertHtml,
  isTriggerEnabledForEvent,
  sendTelegramHtmlMessage,
  TelegramAlertPayload,
  TelegramChatType,
  TelegramDeliveryLogEntry,
  TelegramDestination,
  TelegramTriggerFlags,
  toPublicTelegramConfig,
  verifyTelegramBotToken,
} from './server/telegramService';

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

interface FyersCandleBar {
  index: number;
  date: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  epoch: number;
}

interface PendingOAuthState {
  userId: string;
  brokerId: BrokerId;
  createdAt: number;
}

const PORT = Number(process.env.PORT) || 3000;
const FYERS_API_BASE = 'https://api-t1.fyers.in/api/v3';
const FYERS_DATA_BASE = 'https://api-t1.fyers.in/data';
const AUTH_COOKIE_NAME = 'neoalgo_auth';
const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const pendingOAuthStates = new Map<string, PendingOAuthState>();
const telegramSentKeysByUser = new Map<string, Set<string>>();
const telegramDeliveryLogsByUser = new Map<string, TelegramDeliveryLogEntry[]>();

function recordTelegramDeliveryLog(
  userId: string,
  entry: TelegramDeliveryLogEntry
): void {
  const existing = telegramDeliveryLogsByUser.get(userId) ?? [];
  const next = [entry, ...existing].slice(0, 40);
  telegramDeliveryLogsByUser.set(userId, next);
}

function hasDispatchedTelegramEvent(userId: string, eventKey: string): boolean {
  return telegramSentKeysByUser.get(userId)?.has(eventKey) ?? false;
}

function markDispatchedTelegramEvent(userId: string, eventKey: string): void {
  let set = telegramSentKeysByUser.get(userId);
  if (!set) {
    set = new Set<string>();
    telegramSentKeysByUser.set(userId, set);
  }
  set.add(eventKey);
  if (set.size > 500) {
    const first = set.values().next().value;
    if (first) set.delete(first);
  }
}

function getAppUrl(req?: Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/auth\/fyers\/callback\/?$/, '').replace(/\/+$/, '');
  }
  if (req) {
    const proto =
      (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
      (req.secure ? 'https' : 'http');
    const host =
      (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
      req.headers.host;
    if (host) return `${proto}://${host}`;
  }
  return `http://localhost:${PORT}`;
}

function isRequestHttps(req: http.IncomingMessage): boolean {
  const xfProto = req.headers['x-forwarded-proto'];
  if (typeof xfProto === 'string' && xfProto.toLowerCase().includes('https')) {
    return true;
  }
  const envUrl = process.env.APP_URL?.trim() || '';
  if (envUrl.startsWith('https://')) return true;
  return Boolean((req.socket as { encrypted?: boolean })?.encrypted);
}

function getAuthCookieOptions(req: http.IncomingMessage): CookieOptions {
  const https = isRequestHttps(req);
  return {
    httpOnly: true,
    secure: https,
    sameSite: https ? 'none' : 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

function getFyersCredentials(): { appId: string; secretId: string } | null {
  const appId = process.env.FYERS_APP_ID?.trim();
  const secretId = process.env.FYERS_SECRET_ID?.trim();
  if (
    !appId ||
    !secretId ||
    appId === 'MY_FYERS_APP_ID' ||
    secretId === 'MY_FYERS_SECRET_ID'
  ) {
    return null;
  }
  return { appId, secretId };
}

function getFyersPin(): string | null {
  const pin = process.env.FYERS_PIN?.trim();
  if (!pin || pin === 'MY_FYERS_PIN') return null;
  return pin;
}

function isFyersAuthError(message: string): boolean {
  return /token|auth|expired|invalid.*access|could not authenticate|401/i.test(
    message
  );
}

async function tryRefreshFyersConnection(
  userId: string,
  conn: BrokerConnectionRecord,
  creds: { appId: string; secretId: string }
): Promise<boolean> {
  const pin = getFyersPin();
  if (!conn.refreshToken || !pin) {
    return false;
  }
  try {
    const appIdHash = crypto
      .createHash('sha256')
      .update(`${creds.appId}:${creds.secretId}`)
      .digest('hex');

    const resp = await fetch(`${FYERS_API_BASE}/validate-refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        appIdHash,
        refresh_token: conn.refreshToken,
        pin,
      }),
    });

    const data = (await resp.json()) as {
      s?: string;
      access_token?: string;
    };

    if (resp.ok && data.s === 'ok' && data.access_token) {
      conn.accessToken = data.access_token;
      conn.updatedAt = Date.now();
      saasStore.setBrokerConnection(userId, conn);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function runWithFyersAutoRefresh<T>(
  userId: string,
  conn: BrokerConnectionRecord,
  creds: { appId: string; secretId: string },
  operation: (accessToken: string) => Promise<T>
): Promise<T> {
  try {
    return await operation(conn.accessToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isFyersAuthError(msg)) {
      const refreshed = await tryRefreshFyersConnection(userId, conn, creds);
      if (refreshed) {
        return await operation(conn.accessToken);
      }
    }
    throw err;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = decodeURIComponent(part.slice(0, idx).trim());
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}

function getAuthenticatedUserFromReq(
  req: http.IncomingMessage
): PublicSaaSUser | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  const user = saasStore.getUserBySessionToken(token);
  return user ? toPublicUser(user) : null;
}

function getUserFyersEntry(req: http.IncomingMessage): {
  user: PublicSaaSUser;
  connection: BrokerConnectionRecord;
} | null {
  const user = getAuthenticatedUserFromReq(req);
  if (!user) return null;
  const connection = saasStore.getBrokerConnection(user.id, 'fyers');
  if (!connection) return null;
  return { user, connection };
}

function formatIstHHMM(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

function formatIstHHMMSS(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const second = parts.find((p) => p.type === 'second')?.value ?? '00';
  return `${hour}:${minute}:${second}`;
}

function formatIstDateYYYYMMDD(epochSeconds: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epochSeconds * 1000));
}

function getCurrentIstDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysYYYYMMDD(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

async function fetchFyersHistory(
  appId: string,
  accessToken: string,
  symbol: string,
  rangeFrom: string,
  rangeTo: string = rangeFrom
): Promise<FyersCandleBar[]> {
  const params = new URLSearchParams({
    symbol,
    resolution: '5',
    date_format: '1',
    range_from: rangeFrom,
    range_to: rangeTo,
    cont_flag: '1',
  });

  const resp = await fetch(`${FYERS_DATA_BASE}/history?${params.toString()}`, {
    headers: {
      Authorization: `${appId}:${accessToken}`,
    },
  });

  const data = (await resp.json()) as {
    s?: string;
    message?: string;
    candles?: [number, number, number, number, number, number][];
  };

  if (!resp.ok || (data.s !== 'ok' && data.s !== 'no_data')) {
    throw new Error(data.message || `Fyers history error (${resp.status})`);
  }

  const rawCandles = data.candles || [];
  const dedupByBucket = new Map<string, FyersCandleBar>();

  for (const row of rawCandles) {
    const [epoch, open, high, low, close, volume] = row;
    const istDate = formatIstDateYYYYMMDD(epoch);
    const istTime = formatIstHHMM(epoch);
    const mins = toMinutes(istTime);
    if (
      istDate >= rangeFrom &&
      istDate <= rangeTo &&
      mins >= 9 * 60 + 15 &&
      mins <= 15 * 60 + 25
    ) {
      const bucketKey = `${istDate}_${istTime}`;
      dedupByBucket.set(bucketKey, {
        index: 0,
        date: istDate,
        time: istTime,
        open,
        high,
        low,
        close,
        volume,
        epoch,
      });
    }
  }

  return Array.from(dedupByBucket.values())
    .sort((a, b) => a.epoch - b.epoch)
    .map((bar, idx) => ({ ...bar, index: idx }));
}

async function fetchFyersHistoryRange(
  appId: string,
  accessToken: string,
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<FyersCandleBar[]> {
  const chunkDays = 90;
  const dedup = new Map<number, FyersCandleBar>();
  let cursor = fromDate;

  while (cursor <= toDate) {
    const candidateEnd = addDaysYYYYMMDD(cursor, chunkDays);
    const chunkEnd = candidateEnd < toDate ? candidateEnd : toDate;

    const bars = await fetchFyersHistory(
      appId,
      accessToken,
      symbol,
      cursor,
      chunkEnd
    );
    for (const bar of bars) {
      dedup.set(bar.epoch, bar);
    }

    cursor = addDaysYYYYMMDD(chunkEnd, 1);
    if (cursor <= toDate) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const sorted = Array.from(dedup.values()).sort((a, b) => a.epoch - b.epoch);
  return sorted.map((bar, idx) => ({ ...bar, index: idx }));
}

async function fetchFyersQuote(
  appId: string,
  accessToken: string,
  symbol: string
) {
  const params = new URLSearchParams({ symbols: symbol });
  const resp = await fetch(`${FYERS_DATA_BASE}/quotes?${params.toString()}`, {
    headers: {
      Authorization: `${appId}:${accessToken}`,
    },
  });

  const data = (await resp.json()) as {
    s?: string;
    message?: string;
    d?: Array<{
      n?: string;
      s?: string;
      v?: {
        lp?: number;
        ch?: number;
        chp?: number;
        open_price?: number;
        high_price?: number;
        low_price?: number;
        prev_close_price?: number;
        volume?: number;
        tt?: number;
      };
    }>;
  };

  if (!resp.ok || data.s !== 'ok' || !data.d || data.d.length === 0) {
    throw new Error(data.message || `Fyers quote error (${resp.status})`);
  }

  const quoteItem = data.d[0];
  const v = quoteItem.v || {};
  const nowEpochSec = Math.floor(Date.now() / 1000);

  return {
    symbol: quoteItem.n || symbol,
    ltp: v.lp ?? 0,
    change: v.ch ?? 0,
    changePct: v.chp ?? 0,
    open: v.open_price ?? 0,
    high: v.high_price ?? 0,
    low: v.low_price ?? 0,
    prevClose: v.prev_close_price ?? 0,
    volume: v.volume ?? 0,
    epoch: nowEpochSec,
    istDate: formatIstDateYYYYMMDD(nowEpochSec),
    istTime: formatIstHHMM(nowEpochSec),
    istTimeSec: formatIstHHMMSS(nowEpochSec),
  };
}

async function startServer() {
  saasStore.init();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));

  const fyersCallbackPath = '/auth/fyers/callback';

  // =========================================================================
  // 1. MULTI-USER SAAS AUTHENTICATION ENDPOINTS (/api/auth/*)
  // =========================================================================

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    res.json({
      authenticated: Boolean(user),
      user,
      registeredUsers: saasStore.getUserCount(),
    });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { name, email, password } = (req.body || {}) as {
      name?: string;
      email?: string;
      password?: string;
    };

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const rawPassword = typeof password === 'string' ? password : '';

    if (trimmedName.length < 2 || trimmedName.length > 80) {
      res.status(400).json({ error: 'Please enter your full name (2–80 characters).' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (rawPassword.length < 6 || rawPassword.length > 128) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    try {
      const { user, recoveryKey } = saasStore.createUser(
        trimmedName,
        trimmedEmail,
        rawPassword
      );
      const session = saasStore.createAuthSession(user.id);
      res.cookie(AUTH_COOKIE_NAME, session.token, getAuthCookieOptions(req));
      res.status(201).json({ user: toPublicUser(user), recoveryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      res.status(409).json({ error: msg });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = (req.body || {}) as {
      email?: string;
      password?: string;
    };

    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const rawPassword = typeof password === 'string' ? password : '';

    if (!trimmedEmail || !rawPassword) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = saasStore.authenticateUser(trimmedEmail, rawPassword);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const session = saasStore.createAuthSession(user.id);
    res.cookie(AUTH_COOKIE_NAME, session.token, getAuthCookieOptions(req));
    res.json({ user: toPublicUser(user) });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    saasStore.deleteAuthSession(cookies[AUTH_COOKIE_NAME]);
    const opts = getAuthCookieOptions(req);
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: opts.httpOnly,
      secure: opts.secure,
      sameSite: opts.sameSite,
      path: opts.path,
    });
    res.json({ ok: true });
  });

  // Password Recovery (Recovery Key + Telegram 6-Digit OTP + Owner Reset Code)
  app.post('/api/auth/forgot/options', (req: Request, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    const user = saasStore.getUserByEmail(email);
    if (!user) {
      // Return generic shape without confirming existence
      res.json({
        hasRecoveryKey: true,
        hasTelegramOtp: false,
      });
      return;
    }
    const tg = saasStore.getTelegramConfig(user.id);
    const hasPersonalTelegram = Boolean(
      tg.botToken &&
        tg.destinations.some((d) => d.enabled && d.type === 'private')
    );
    res.json({
      hasRecoveryKey: Boolean(user.recoveryKeyHash && user.recoveryKeySalt),
      hasTelegramOtp: hasPersonalTelegram,
    });
  });

  app.post('/api/auth/forgot/telegram-otp', async (req: Request, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    const user = saasStore.getUserByEmail(email);
    if (!user) {
      res.status(404).json({
        error:
          'No Telegram personal DM recovery is configured for this email. Use your Recovery Key or contact your workspace owner.',
      });
      return;
    }

    const tg = saasStore.getTelegramConfig(user.id);
    const privateDest = tg.destinations.find(
      (d) => d.enabled && d.type === 'private'
    );
    if (!tg.botToken || !privateDest) {
      res.status(400).json({
        error:
          'Telegram DM is not configured for this account. Use your Recovery Key or ask your workspace owner for a reset code.',
      });
      return;
    }

    const code = saasStore.createPasswordResetOtp(user.id, 'telegram', 10 * 60 * 1000);
    const nowEpoch = Math.floor(Date.now() / 1000);
    const html = [
      '<b>NeoAlgo · Password Recovery Code</b>',
      `Your single-use verification code is: <code>${code}</code>`,
      'Valid for 10 minutes. Do not share this code with anyone.',
      `<i>Requested at ${formatIstHHMMSS(nowEpoch)} IST</i>`,
    ].join('\n');

    const delivery = await sendTelegramHtmlMessage(tg.botToken, privateDest, html);
    if (!delivery.ok) {
      res.status(502).json({
        error: `Could not deliver Telegram code: ${delivery.error || 'Telegram error'}`,
      });
      return;
    }

    res.json({
      ok: true,
      message: `6-digit recovery code sent to your Telegram (${privateDest.label}).`,
    });
  });

  app.post('/api/auth/forgot/reset', (req: Request, res: Response) => {
    const { email, recoveryKey, otpCode, newPassword } = (req.body || {}) as {
      email?: string;
      recoveryKey?: string;
      otpCode?: string;
      newPassword?: string;
    };

    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const rawNew = typeof newPassword === 'string' ? newPassword : '';

    if (!trimmedEmail) {
      res.status(400).json({ error: 'Email address is required.' });
      return;
    }
    if (rawNew.length < 6 || rawNew.length > 128) {
      res.status(400).json({
        error: 'New password must be at least 6 characters.',
      });
      return;
    }

    const outcome = saasStore.resetPasswordViaRecovery(
      trimmedEmail,
      { recoveryKey, otpCode },
      rawNew
    );

    if (!outcome.ok || !outcome.user) {
      res.status(400).json({
        error: outcome.error || 'Password recovery failed.',
      });
      return;
    }

    const session = saasStore.createAuthSession(outcome.user.id);
    res.cookie(AUTH_COOKIE_NAME, session.token, getAuthCookieOptions(req));
    res.json({
      ok: true,
      user: toPublicUser(outcome.user),
      nextRecoveryKey: outcome.nextRecoveryKey ?? null,
    });
  });

  // =========================================================================
  // 1B. ACCOUNT PROFILE, AVATAR, PASSWORD & SECURITY SETTINGS (/api/account/*)
  // =========================================================================

  app.put('/api/account/profile', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { name, bio, avatarDataUrl } = (req.body || {}) as {
      name?: string;
      bio?: string;
      avatarDataUrl?: string | null;
    };

    if (name !== undefined) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (trimmed.length < 2 || trimmed.length > 80) {
        res.status(400).json({ error: 'Full name must be 2–80 characters.' });
        return;
      }
    }

    if (avatarDataUrl !== undefined && avatarDataUrl !== null) {
      if (
        typeof avatarDataUrl !== 'string' ||
        !/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(
          avatarDataUrl
        )
      ) {
        res.status(400).json({
          error: 'Profile picture must be a valid PNG, JPEG, or WebP image.',
        });
        return;
      }
      if (avatarDataUrl.length > 500_000) {
        res.status(400).json({
          error: 'Profile picture is too large (max ~350 KB after compression).',
        });
        return;
      }
    }

    const updated = saasStore.updateUserProfile(user.id, {
      name,
      bio,
      avatarDataUrl,
    });
    if (!updated) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    res.json({ ok: true, user: toPublicUser(updated) });
  });

  app.post('/api/account/change-password', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { currentPassword, newPassword } = (req.body || {}) as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        error: 'Current password and new password are required.',
      });
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({
        error: 'New password must be at least 6 characters.',
      });
      return;
    }

    const outcome = saasStore.changeUserPassword(
      user.id,
      currentPassword,
      newPassword
    );
    if (!outcome.ok) {
      res.status(400).json({ error: outcome.error || 'Could not update password.' });
      return;
    }

    res.json({ ok: true });
  });

  app.post('/api/account/recovery-key/regenerate', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const recoveryKey = saasStore.regenerateRecoveryKey(user.id);
    if (!recoveryKey) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    const refreshed = saasStore.getUserById(user.id);
    res.json({
      ok: true,
      recoveryKey,
      user: refreshed ? toPublicUser(refreshed) : user,
    });
  });

  app.get('/api/account/team', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Owner permissions required.' });
      return;
    }
    res.json({ users: saasStore.listPublicUsers() });
  });

  app.post('/api/account/team/:targetUserId/reset-code', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Owner permissions required.' });
      return;
    }
    const target = saasStore.getUserById(req.params.targetUserId);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const code = saasStore.createPasswordResetOtp(target.id, 'owner', 15 * 60 * 1000);
    res.json({
      ok: true,
      email: target.email,
      code,
      expiresInMinutes: 15,
    });
  });

  // =========================================================================
  // 2. PER-USER PERSISTENT WORKSPACE DATA (/api/user/*)
  // =========================================================================

  app.get('/api/user/workspace', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    res.json(saasStore.getWorkspace(user.id));
  });

  app.put('/api/user/strategy-config', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const config = req.body?.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      res.status(400).json({ error: 'Valid strategy config object required.' });
      return;
    }
    const updated = saasStore.updateWorkspace(user.id, {
      strategyConfig: config as Record<string, unknown>,
    });
    res.json({ ok: true, updatedAt: updated.updatedAt });
  });

  app.put('/api/user/paper-trades', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const entries = req.body?.entries;
    if (!Array.isArray(entries)) {
      res.status(400).json({ error: 'entries array is required.' });
      return;
    }
    const updated = saasStore.updateWorkspace(user.id, {
      paperTrades: entries.slice(0, 10000),
    });
    res.json({ ok: true, count: updated.paperTrades.length, updatedAt: updated.updatedAt });
  });

  app.put('/api/user/backtest-reports', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const reports = req.body?.reports;
    if (!Array.isArray(reports)) {
      res.status(400).json({ error: 'reports array is required.' });
      return;
    }
    const updated = saasStore.updateWorkspace(user.id, {
      savedReports: reports.slice(0, 200),
    });
    res.json({ ok: true, count: updated.savedReports.length, updatedAt: updated.updatedAt });
  });

  app.put('/api/user/order-journal', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const orders = req.body?.orders;
    const positions = req.body?.positions;
    if (!Array.isArray(orders) || !Array.isArray(positions)) {
      res.status(400).json({ error: 'orders and positions arrays are required.' });
      return;
    }
    const updated = saasStore.updateWorkspace(user.id, {
      orderJournal: {
        orders: orders.slice(0, 10000),
        positions: positions.slice(0, 5000),
      },
    });
    res.json({
      ok: true,
      ordersCount: updated.orderJournal?.orders.length ?? 0,
      positionsCount: updated.orderJournal?.positions.length ?? 0,
      updatedAt: updated.updatedAt,
    });
  });

  // =========================================================================
  // 3. MULTI-BROKER HUB REGISTRY (/api/brokers/*)
  // =========================================================================

  app.get('/api/brokers', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const fyersCreds = getFyersCredentials();
    const appUrl = getAppUrl(req);

    const brokers: BrokerPublicStatus[] = BROKER_CATALOG.map((item) => {
      const conn = saasStore.getBrokerConnection(user.id, item.id);
      const isFyers = item.id === 'fyers';
      return {
        id: item.id,
        name: item.name,
        shortName: item.shortName,
        exchangeCoverage: item.exchangeCoverage,
        availability: item.availability,
        authType: item.authType,
        configured: isFyers ? Boolean(fyersCreds) : false,
        connected: Boolean(conn),
        profile: conn?.profile ?? null,
        connectedAt: conn?.connectedAt ?? null,
        autoRefreshEnabled: Boolean(
          isFyers && conn?.refreshToken && getFyersPin()
        ),
        callbackUrl: isFyers ? `${appUrl}${fyersCallbackPath}` : null,
        capabilities: item.capabilities,
        description: item.description,
      };
    });

    res.json({ brokers, istToday: getCurrentIstDateString() });
  });

  app.post('/api/brokers/:brokerId/disconnect', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const brokerId = req.params.brokerId as BrokerId;
    saasStore.removeBrokerConnection(user.id, brokerId);
    res.json({ ok: true, brokerId });
  });

  // =========================================================================
  // 3B. PER-USER TELEGRAM ALERTS (/api/telegram/*)
  // =========================================================================

  app.get('/api/telegram/config', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const stored = saasStore.getTelegramConfig(user.id);
    res.json({
      config: toPublicTelegramConfig(stored),
      recentDeliveries: telegramDeliveryLogsByUser.get(user.id) ?? [],
    });
  });

  app.put('/api/telegram/config', async (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const body = (req.body || {}) as {
      enabled?: boolean;
      botToken?: string;
      clearBotToken?: boolean;
      destinations?: TelegramDestination[];
      triggers?: Partial<TelegramTriggerFlags>;
    };

    const existing = saasStore.getTelegramConfig(user.id);
    let nextToken = existing.botToken;
    let botUsername = existing.botUsername;
    let botFirstName = existing.botFirstName;

    if (body.clearBotToken) {
      nextToken = '';
      botUsername = undefined;
      botFirstName = undefined;
    } else if (typeof body.botToken === 'string' && body.botToken.trim()) {
      const candidate = body.botToken.trim();
      const verified = await verifyTelegramBotToken(candidate);
      if (!verified.ok) {
        res.status(400).json({
          error:
            verified.error ||
            'Could not validate Telegram Bot Token with @BotFather.',
        });
        return;
      }
      nextToken = candidate;
      botUsername = verified.username;
      botFirstName = verified.firstName;
    }

    const validTypes = new Set<TelegramChatType>([
      'private',
      'group',
      'channel',
    ]);
    const rawDestinations = Array.isArray(body.destinations)
      ? body.destinations
      : existing.destinations;

    const cleanedDestinations: TelegramDestination[] = [];
    const seenIds = new Set<string>();
    for (const d of rawDestinations.slice(0, 25)) {
      if (!d || typeof d.chatId !== 'string' || !d.chatId.trim()) continue;
      const chatId = d.chatId.trim();
      if (seenIds.has(chatId)) continue;
      seenIds.add(chatId);
      const type: TelegramChatType = validTypes.has(d.type)
        ? d.type
        : chatId.startsWith('@')
        ? 'channel'
        : chatId.startsWith('-100')
        ? 'channel'
        : chatId.startsWith('-')
        ? 'group'
        : 'private';
      cleanedDestinations.push({
        id:
          typeof d.id === 'string' && d.id.trim()
            ? d.id.trim()
            : `tg_${crypto.randomBytes(6).toString('hex')}`,
        label:
          typeof d.label === 'string' && d.label.trim()
            ? d.label.trim().slice(0, 60)
            : chatId,
        chatId,
        type,
        enabled: Boolean(d.enabled),
      });
    }

    const nextTriggers: TelegramTriggerFlags = {
      ...DEFAULT_TELEGRAM_TRIGGERS,
      ...existing.triggers,
      ...(body.triggers || {}),
    };

    const saved = saasStore.setTelegramConfig(user.id, {
      enabled:
        typeof body.enabled === 'boolean' ? body.enabled : existing.enabled,
      botToken: nextToken,
      botUsername,
      botFirstName,
      destinations: cleanedDestinations,
      triggers: nextTriggers,
      updatedAt: Date.now(),
    });

    res.json({
      ok: true,
      config: toPublicTelegramConfig(saved),
      recentDeliveries: telegramDeliveryLogsByUser.get(user.id) ?? [],
    });
  });

  app.post('/api/telegram/discover', async (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const bodyToken =
      typeof req.body?.botToken === 'string' ? req.body.botToken.trim() : '';
    const stored = saasStore.getTelegramConfig(user.id);
    const token = bodyToken || stored.botToken;

    if (!token) {
      res.status(400).json({
        error: 'Enter or save your Telegram Bot Token first to detect chats.',
      });
      return;
    }

    const result = await discoverTelegramChats(token);
    if (!result.ok) {
      res.status(400).json({ error: result.error, chats: [] });
      return;
    }
    res.json({ chats: result.chats });
  });

  app.post('/api/telegram/test', async (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const body = (req.body || {}) as {
      chatId?: string;
      samplePayload?: TelegramAlertPayload;
    };
    const stored = saasStore.getTelegramConfig(user.id);
    if (!stored.botToken) {
      res.status(400).json({
        error: 'Save your Telegram Bot Token before sending a test alert.',
      });
      return;
    }

    const targets = body.chatId
      ? stored.destinations.filter((d) => d.chatId === body.chatId)
      : stored.destinations.filter((d) => d.enabled);

    if (targets.length === 0) {
      res.status(400).json({
        error: body.chatId
          ? 'Save the destination first before testing it.'
          : 'Add and enable at least one Telegram destination (personal, group, or channel).',
      });
      return;
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    const payload: TelegramAlertPayload = body.samplePayload
      ? {
          ...body.samplePayload,
          isSample: true,
          sessionDate: body.samplePayload.sessionDate || getCurrentIstDateString(),
          time: body.samplePayload.time || formatIstHHMMSS(nowEpoch),
        }
      : {
          eventKey: `test_${Date.now()}`,
          eventType: 'TEST',
          symbol: 'NSE:NIFTY50-INDEX',
          sessionDate: getCurrentIstDateString(),
          time: formatIstHHMMSS(nowEpoch),
          isSample: true,
        };

    const htmlText = formatTelegramAlertHtml(payload);
    const results = await Promise.all(
      targets.map((dest) =>
        sendTelegramHtmlMessage(stored.botToken, dest, htmlText)
      )
    );

    const deliveredCount = results.filter((r) => r.ok).length;
    const failedCount = results.length - deliveredCount;
    const logEntry: TelegramDeliveryLogEntry = {
      id: `dlv_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: formatIstHHMMSS(nowEpoch) + ' IST',
      eventType: payload.eventType,
      symbol: payload.symbol,
      summary:
        payload.eventType === 'TEST'
          ? 'Connection test message'
          : `${payload.eventType.replace(/_/g, ' ')} (Sample)`,
      totalTargets: results.length,
      deliveredCount,
      failedCount,
      results,
    };
    recordTelegramDeliveryLog(user.id, logEntry);

    res.json({
      ok: deliveredCount > 0,
      deliveredCount,
      failedCount,
      results,
      logEntry,
    });
  });

  app.post('/api/telegram/dispatch', async (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const payload = req.body as TelegramAlertPayload | undefined;
    if (!payload || !payload.eventKey || !payload.eventType) {
      res.status(400).json({ error: 'Invalid Telegram alert payload.' });
      return;
    }

    const stored = saasStore.getTelegramConfig(user.id);
    if (!stored.enabled || !stored.botToken) {
      res.json({ skipped: true, reason: 'disabled' });
      return;
    }

    if (!isTriggerEnabledForEvent(stored.triggers, payload.eventType)) {
      res.json({ skipped: true, reason: 'trigger_disabled' });
      return;
    }

    if (hasDispatchedTelegramEvent(user.id, payload.eventKey)) {
      res.json({ skipped: true, reason: 'duplicate' });
      return;
    }

    const targets = stored.destinations.filter((d) => d.enabled);
    if (targets.length === 0) {
      res.json({ skipped: true, reason: 'no_enabled_destinations' });
      return;
    }

    // Reserve eventKey immediately to avoid duplicate sends under concurrent ticks
    markDispatchedTelegramEvent(user.id, payload.eventKey);

    const htmlText = formatTelegramAlertHtml(payload);
    const results = await Promise.all(
      targets.map((dest) =>
        sendTelegramHtmlMessage(stored.botToken, dest, htmlText)
      )
    );

    const deliveredCount = results.filter((r) => r.ok).length;
    const failedCount = results.length - deliveredCount;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const logEntry: TelegramDeliveryLogEntry = {
      id: `dlv_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: formatIstHHMMSS(nowEpoch) + ' IST',
      eventType: payload.eventType,
      symbol: payload.symbol || 'NSE:NIFTY50-INDEX',
      summary: `${payload.eventType.replace(/_/g, ' ')} @ ${payload.time} IST`,
      totalTargets: results.length,
      deliveredCount,
      failedCount,
      results,
    };
    recordTelegramDeliveryLog(user.id, logEntry);

    res.json({
      ok: deliveredCount > 0,
      deliveredCount,
      failedCount,
      results,
      logEntry,
    });
  });

  // =========================================================================
  // 4. PER-USER FYERS API v3 CONNECTOR (/api/fyers/* & /auth/fyers/callback)
  // =========================================================================

  app.get('/api/fyers/status', (req: Request, res: Response) => {
    const creds = getFyersCredentials();
    const user = getAuthenticatedUserFromReq(req);
    const conn = user ? saasStore.getBrokerConnection(user.id, 'fyers') : null;
    const appUrl = getAppUrl(req);

    res.json({
      configured: Boolean(creds),
      appId: creds?.appId ?? null,
      authenticated: Boolean(conn),
      profile: conn?.profile ?? null,
      connectedAt: conn?.connectedAt ?? null,
      autoRefreshEnabled: Boolean(conn?.refreshToken && getFyersPin()),
      callbackUrl: `${appUrl}${fyersCallbackPath}`,
      istToday: getCurrentIstDateString(),
    });
  });

  app.get('/api/fyers/auth/url', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({
        error: 'Please sign in to your NeoAlgo account before connecting Fyers.',
      });
      return;
    }

    const creds = getFyersCredentials();
    if (!creds) {
      res.status(400).json({
        error:
          'FYERS_APP_ID and FYERS_SECRET_ID are not configured on the server (.env).',
      });
      return;
    }

    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuthStates.set(state, {
      userId: user.id,
      brokerId: 'fyers',
      createdAt: Date.now(),
    });

    // Prune stale OAuth states older than 15 minutes
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [key, entry] of pendingOAuthStates.entries()) {
      if (entry.createdAt < cutoff) pendingOAuthStates.delete(key);
    }

    const redirectUri = `${getAppUrl(req)}${fyersCallbackPath}`;
    const params = new URLSearchParams({
      client_id: creds.appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    });

    const url = `${FYERS_API_BASE}/generate-authcode?${params.toString()}`;
    res.json({ url, redirectUri });
  });

  const fyersCallbackHandler = async (req: Request, res: Response) => {
    const creds = getFyersCredentials();
    if (!creds) {
      res.status(500).send('Fyers server credentials are not configured.');
      return;
    }

    const authCode =
      typeof req.query.auth_code === 'string'
        ? req.query.auth_code
        : typeof req.query.code === 'string'
        ? req.query.code
        : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!authCode) {
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; padding: 24px;">
            <h3>Fyers Authentication Failed</h3>
            <p>Missing authorization code from Fyers callback.</p>
          </body>
        </html>
      `);
      return;
    }

    const pending = state ? pendingOAuthStates.get(state) : undefined;
    if (!pending) {
      res.status(400).send('Invalid or expired OAuth state parameter.');
      return;
    }
    pendingOAuthStates.delete(state);

    try {
      const appIdHash = crypto
        .createHash('sha256')
        .update(`${creds.appId}:${creds.secretId}`)
        .digest('hex');

      const tokenResp = await fetch(`${FYERS_API_BASE}/validate-authcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          appIdHash,
          code: authCode,
        }),
      });

      const tokenData = (await tokenResp.json()) as {
        s?: string;
        message?: string;
        access_token?: string;
        refresh_token?: string;
      };

      if (!tokenResp.ok || tokenData.s !== 'ok' || !tokenData.access_token) {
        throw new Error(
          tokenData.message || 'Failed to validate Fyers auth_code'
        );
      }

      let profile: BrokerProfile | null = null;
      try {
        const profResp = await fetch(`${FYERS_API_BASE}/profile`, {
          headers: {
            Authorization: `${creds.appId}:${tokenData.access_token}`,
          },
        });
        const profJson = (await profResp.json()) as {
          s?: string;
          data?: {
            name?: string;
            fy_id?: string;
            email_id?: string;
          };
        };
        if (profJson.s === 'ok' && profJson.data) {
          profile = {
            name: profJson.data.name,
            clientId: profJson.data.fy_id,
            email: profJson.data.email_id,
            fy_id: profJson.data.fy_id,
            email_id: profJson.data.email_id,
          };
        }
      } catch {
        // Optional profile metadata
      }

      const now = Date.now();
      saasStore.setBrokerConnection(pending.userId, {
        brokerId: 'fyers',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        profile,
        connectedAt: now,
        updatedAt: now,
      });

      res.send(`
        <html>
          <body style="font-family: sans-serif; padding: 24px; color: #0f172a;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'FYERS_AUTH_SUCCESS', brokerId: 'fyers' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Fyers account connected to your NeoAlgo workspace. This window will close automatically.</p>
          </body>
        </html>
      `);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; padding: 24px; color: #b91c1c;">
            <h3>Fyers Token Exchange Failed</h3>
            <p>${msg}</p>
          </body>
        </html>
      `);
    }
  };

  app.get([fyersCallbackPath, `${fyersCallbackPath}/`], fyersCallbackHandler);

  app.post('/api/fyers/logout', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (user) {
      saasStore.removeBrokerConnection(user.id, 'fyers');
    }
    res.json({ ok: true });
  });

  app.get('/api/fyers/history', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const creds = getFyersCredentials();
    const entry = getUserFyersEntry(req);
    if (!creds || !entry) {
      res.status(401).json({ error: 'Connect your Fyers account first.' });
      return;
    }

    const symbol =
      typeof req.query.symbol === 'string' && req.query.symbol.trim()
        ? req.query.symbol.trim()
        : 'NSE:NIFTY50-INDEX';
    const dateStr =
      typeof req.query.date === 'string' && req.query.date.trim()
        ? req.query.date.trim()
        : getCurrentIstDateString();

    try {
      const candles = await runWithFyersAutoRefresh(
        entry.user.id,
        entry.connection,
        creds,
        (token) => fetchFyersHistory(creds.appId, token, symbol, dateStr)
      );
      res.json({ symbol, date: dateStr, candles });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to fetch Fyers history';
      if (isFyersAuthError(msg)) {
        res.status(401).json({
          error:
            'Your daily Fyers access token expired (SEBI resets broker tokens daily at 06:00 IST). Reconnect Fyers in the Brokers hub.',
        });
        return;
      }
      res.status(502).json({ error: msg });
    }
  });

  app.get('/api/fyers/history-range', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const creds = getFyersCredentials();
    const entry = getUserFyersEntry(req);
    if (!creds || !entry) {
      res.status(401).json({ error: 'Connect your Fyers account first.' });
      return;
    }

    const symbol =
      typeof req.query.symbol === 'string' && req.query.symbol.trim()
        ? req.query.symbol.trim()
        : 'NSE:NIFTY50-INDEX';
    const rawDays = Number(req.query.days) || 365;
    const days = Math.max(1, Math.min(366, rawDays));
    const toDate =
      typeof req.query.toDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(req.query.toDate)
        ? req.query.toDate
        : getCurrentIstDateString();
    const explicitFrom =
      typeof req.query.fromDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(req.query.fromDate)
        ? req.query.fromDate
        : null;
    const fromDate = explicitFrom || addDaysYYYYMMDD(toDate, -days);

    if (fromDate > toDate) {
      res
        .status(400)
        .json({ error: 'From Date cannot be later than To Date.' });
      return;
    }

    const diffMs =
      Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`);
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays > 370) {
      res.status(400).json({
        error:
          'Maximum range per backtest fetch is 1 year (370 calendar days).',
      });
      return;
    }

    try {
      const candles = await runWithFyersAutoRefresh(
        entry.user.id,
        entry.connection,
        creds,
        (token) =>
          fetchFyersHistoryRange(creds.appId, token, symbol, fromDate, toDate)
      );
      const uniqueDays = new Set(candles.map((c) => c.date)).size;
      res.json({
        symbol,
        fromDate,
        toDate,
        tradingDays: uniqueDays,
        totalCandles: candles.length,
        candles,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to fetch Fyers range history';
      if (isFyersAuthError(msg)) {
        res.status(401).json({
          error:
            'Your daily Fyers access token expired (SEBI resets broker tokens daily at 06:00 IST). Reconnect Fyers in the Brokers hub.',
        });
        return;
      }
      res.status(502).json({ error: msg });
    }
  });

  app.get('/api/fyers/quotes', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const creds = getFyersCredentials();
    const entry = getUserFyersEntry(req);
    if (!creds || !entry) {
      res.status(401).json({ error: 'Connect your Fyers account first.' });
      return;
    }

    const symbol =
      typeof req.query.symbol === 'string' && req.query.symbol.trim()
        ? req.query.symbol.trim()
        : 'NSE:NIFTY50-INDEX';

    try {
      const quote = await runWithFyersAutoRefresh(
        entry.user.id,
        entry.connection,
        creds,
        (token) => fetchFyersQuote(creds.appId, token, symbol)
      );
      res.json(quote);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to fetch Fyers quote';
      if (isFyersAuthError(msg)) {
        res.status(401).json({
          error:
            'Your daily Fyers access token expired. Reconnect Fyers in the Brokers hub.',
        });
        return;
      }
      res.status(502).json({ error: msg });
    }
  });

  // Vite middleware (dev) or static dist serving (prod for AWS VPS)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);

  // Per-user Real-time Fyers WebSocket broadcaster (/ws/fyers)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/fyers' });

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const creds = getFyersCredentials();
    const entry = getUserFyersEntry(req);

    if (!creds || !entry) {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Sign in and connect your Fyers account to stream live data.',
        })
      );
      ws.close(1008, 'Unauthorized');
      return;
    }

    let subscribedSymbol = 'NSE:NIFTY50-INDEX';
    let subscribedDate = getCurrentIstDateString();
    let active = false;
    let pollTimer: NodeJS.Timeout | null = null;
    let lastSyncedBucket = '';

    const stopPolling = () => {
      active = false;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const runPoll = async () => {
      if (!active || ws.readyState !== WebSocket.OPEN) return;
      try {
        const nowIst = formatIstHHMM(Math.floor(Date.now() / 1000));
        const [hh, mm] = nowIst.split(':').map(Number);
        const bucketMin = Math.floor(mm / 5) * 5;
        const currentBucket = `${String(hh).padStart(2, '0')}:${String(
          bucketMin
        ).padStart(2, '0')}`;

        if (currentBucket !== lastSyncedBucket) {
          lastSyncedBucket = currentBucket;
          const candles = await runWithFyersAutoRefresh(
            entry.user.id,
            entry.connection,
            creds,
            (token) =>
              fetchFyersHistory(
                creds.appId,
                token,
                subscribedSymbol,
                subscribedDate
              )
          );
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'history_sync',
                symbol: subscribedSymbol,
                date: subscribedDate,
                candles,
              })
            );
          }
        }

        const quote = await runWithFyersAutoRefresh(
          entry.user.id,
          entry.connection,
          creds,
          (token) => fetchFyersQuote(creds.appId, token, subscribedSymbol)
        );
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'quote', data: quote }));
        }
      } catch (err) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'error',
              message:
                err instanceof Error ? err.message : 'Fyers stream poll error',
            })
          );
        }
      }
    };

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          action?: string;
          symbol?: string;
          date?: string;
        };
        if (msg.action === 'subscribe') {
          subscribedSymbol = msg.symbol?.trim() || 'NSE:NIFTY50-INDEX';
          subscribedDate = msg.date?.trim() || getCurrentIstDateString();
          lastSyncedBucket = '';
          stopPolling();
          active = true;
          void runPoll();
          pollTimer = setInterval(() => {
            void runPoll();
          }, 1000);
        } else if (msg.action === 'unsubscribe') {
          stopPolling();
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      stopPolling();
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NeoAlgo SaaS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
