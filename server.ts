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
import { candleStore } from './server/candleStore';
import { instrumentMaster } from './server/instrumentMaster';
import { liveStreamManager, StreamQuoteTick } from './server/liveStreamManager';
import {
  AccountStatus,
  PublicSaaSUser,
  saasStore,
  SubscriptionPlan,
  toPublicUser,
} from './server/saasStore';
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
import { normalizeFyersSymbol } from './src/utils/fyersSymbols';

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

function resolveFyersPinForConnection(
  conn: BrokerConnectionRecord | null
): { pin: string | null; source: 'account' | 'server' | null } {
  const accountPin = conn?.pin?.trim();
  if (accountPin) return { pin: accountPin, source: 'account' };
  const envPin = getFyersPin();
  if (envPin) return { pin: envPin, source: 'server' };
  return { pin: null, source: null };
}

/**
 * SEBI resets Indian broker daily access tokens around 06:00 IST.
 * Returns true if the stored access token was last updated before the most recent 06:00 IST cutoff.
 */
function isFyersTokenStaleForTodayIst(updatedAt: number | undefined): boolean {
  if (!updatedAt || !Number.isFinite(updatedAt)) return true;
  const nowMs = Date.now();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(nowMs + istOffsetMs);
  const cutoffIst = new Date(
    Date.UTC(
      nowIst.getUTCFullYear(),
      nowIst.getUTCMonth(),
      nowIst.getUTCDate(),
      6,
      5,
      0
    )
  );
  // If current IST time is before 06:05 AM, the active cutoff was yesterday 06:05 AM IST
  if (nowIst.getTime() < cutoffIst.getTime()) {
    cutoffIst.setUTCDate(cutoffIst.getUTCDate() - 1);
  }
  const cutoffUtcMs = cutoffIst.getTime() - istOffsetMs;
  return updatedAt < cutoffUtcMs;
}

const fyersRefreshInFlight = new Map<string, Promise<boolean>>();

async function tryRefreshFyersConnection(
  userId: string,
  conn: BrokerConnectionRecord,
  creds: { appId: string; secretId: string }
): Promise<boolean> {
  const { pin } = resolveFyersPinForConnection(conn);
  if (!conn.refreshToken || !pin) {
    return false;
  }

  const existing = fyersRefreshInFlight.get(userId);
  if (existing) return existing;

  const task = (async () => {
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
        refresh_token?: string;
      };

      if (resp.ok && data.s === 'ok' && data.access_token) {
        conn.accessToken = data.access_token;
        if (data.refresh_token) {
          conn.refreshToken = data.refresh_token;
        }
        conn.updatedAt = Date.now();
        saasStore.setBrokerConnection(userId, conn);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      fyersRefreshInFlight.delete(userId);
    }
  })();

  fyersRefreshInFlight.set(userId, task);
  return task;
}

async function proactivelyRefreshStaleFyersConnections(): Promise<void> {
  const creds = getFyersCredentials();
  if (!creds) return;
  const all = saasStore.getAllBrokerConnections('fyers');
  for (const { userId, connection } of all) {
    if (isFyersTokenStaleForTodayIst(connection.updatedAt)) {
      const { pin } = resolveFyersPinForConnection(connection);
      if (connection.refreshToken && pin) {
        await tryRefreshFyersConnection(userId, connection, creds);
      }
    }
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

function isNseMarketClosedTodayIst(): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  const todayStr = formatIstDateYYYYMMDD(nowSec);
  const [y, m, d] = todayStr.split('-').map(Number);
  if (y && m && d) {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === 0 || dow === 6) return true;
  }
  const nowMins = toMinutes(formatIstHHMM(nowSec));
  return nowMins >= 15 * 60 + 35;
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

async function fetchFyersQuotesBatch(
  appId: string,
  accessToken: string,
  symbols: string[]
): Promise<Record<string, StreamQuoteTick>> {
  const cleanSymbols = Array.from(
    new Set(symbols.map((s) => s.trim()).filter(Boolean))
  );
  if (cleanSymbols.length === 0) return {};

  const params = new URLSearchParams({ symbols: cleanSymbols.join(',') });
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

  const nowEpochSec = Math.floor(Date.now() / 1000);
  const istDate = formatIstDateYYYYMMDD(nowEpochSec);
  const istTime = formatIstHHMM(nowEpochSec);
  const istTimeSec = formatIstHHMMSS(nowEpochSec);
  const out: Record<string, StreamQuoteTick> = {};
  const quoteList = data.d;

  for (let i = 0; i < quoteList.length; i++) {
    const quoteEntry = quoteList[i];
    if (!quoteEntry || quoteEntry.s === 'error') continue;
    const v = quoteEntry.v || {};
    const sym = quoteEntry.n || cleanSymbols[i] || cleanSymbols[0];
    const tick: StreamQuoteTick = {
      symbol: sym,
      ltp: v.lp ?? 0,
      change: v.ch ?? 0,
      changePct: v.chp ?? 0,
      open: v.open_price ?? 0,
      high: v.high_price ?? 0,
      low: v.low_price ?? 0,
      prevClose: v.prev_close_price ?? 0,
      volume: v.volume ?? 0,
      epoch: nowEpochSec,
      istDate,
      istTime,
      istTimeSec,
    };
    out[sym] = tick;
    if (cleanSymbols[i] && !out[cleanSymbols[i]]) {
      out[cleanSymbols[i]] = tick;
    }
  }

  return out;
}

async function fetchFyersQuote(
  appId: string,
  accessToken: string,
  symbol: string
): Promise<StreamQuoteTick> {
  const map = await fetchFyersQuotesBatch(appId, accessToken, [symbol]);
  const found = map[symbol] ?? Object.values(map)[0];
  if (!found) {
    throw new Error(`No Fyers quote returned for ${symbol}`);
  }
  return found;
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
    // Only allow initial one-time Admin bootstrap when zero users exist;
    // afterwards, only the Admin can create customer accounts from User Management.
    if (saasStore.getUserCount() > 0) {
      res.status(403).json({
        error:
          'Public sign-up is disabled. Please contact your administrator to create an account.',
      });
      return;
    }

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

    const outcome = saasStore.authenticateUserDetailed(trimmedEmail, rawPassword);
    if (!outcome.ok || !outcome.user) {
      res
        .status(outcome.code || 401)
        .json({ error: outcome.error || 'Invalid email or password.' });
      return;
    }

    const session = saasStore.createAuthSession(outcome.user.id);
    res.cookie(AUTH_COOKIE_NAME, session.token, getAuthCookieOptions(req));
    res.json({ user: toPublicUser(outcome.user) });
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
    if (!outcome.ok || !outcome.user) {
      res.status(400).json({ error: outcome.error || 'Could not update password.' });
      return;
    }

    res.json({ ok: true, user: toPublicUser(outcome.user) });
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
  // 1C. ADMIN USER & SUBSCRIPTION MANAGEMENT (/api/admin/users/*)
  // =========================================================================

  app.get('/api/admin/users', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    res.json({
      users: saasStore.listAdminUsers(),
      defaultCustomerPassword: 'neo@123',
      currentAdminId: user.id,
    });
  });

  app.post('/api/admin/users', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }

    const {
      name,
      email,
      role: rawRole,
      userType,
      subscriptionPlan,
      initialVirtualBalance,
      virtualBalance,
    } = (req.body || {}) as {
      name?: string;
      email?: string;
      role?: string;
      userType?: string;
      subscriptionPlan?: string;
      initialVirtualBalance?: number;
      virtualBalance?: number;
    };

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const requestedType = String(userType || rawRole || 'customer')
      .trim()
      .toLowerCase();
    const resolvedRole: 'owner' | 'trader' =
      requestedType === 'admin' || requestedType === 'owner'
        ? 'owner'
        : 'trader';

    const validPlans: Array<Exclude<SubscriptionPlan, 'admin'>> = [
      '1m',
      '3m',
      '6m',
      '1y',
    ];
    const plan = validPlans.includes(
      subscriptionPlan as Exclude<SubscriptionPlan, 'admin'>
    )
      ? (subscriptionPlan as Exclude<SubscriptionPlan, 'admin'>)
      : '1m';

    const rawVirtual =
      initialVirtualBalance !== undefined
        ? Number(initialVirtualBalance)
        : virtualBalance !== undefined
        ? Number(virtualBalance)
        : 100000;
    if (!Number.isFinite(rawVirtual) || rawVirtual < 1000 || rawVirtual > 1_000_000_000) {
      res.status(400).json({
        error: 'Virtual wallet money must be between ₹1,000 and ₹100 Cr.',
      });
      return;
    }

    if (trimmedName.length < 2 || trimmedName.length > 80) {
      res
        .status(400)
        .json({ error: 'Full name must be 2–80 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    try {
      const {
        user: created,
        defaultPassword,
        paperWalletCapital,
      } = saasStore.createCustomerByAdmin({
        name: trimmedName,
        email: trimmedEmail,
        role: resolvedRole,
        subscriptionPlan: plan,
        initialVirtualBalance: Math.round(rawVirtual),
      });
      res.status(201).json({
        ok: true,
        user: {
          ...toPublicUser(created),
          paperWalletCapital,
        },
        defaultPassword,
        paperWalletCapital,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to create user account.';
      res.status(409).json({ error: msg });
    }
  });

  app.patch('/api/admin/users/:targetUserId/wallet', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    const rawAmount = Number(
      req.body?.startingCapital ?? req.body?.virtualBalance
    );
    if (!Number.isFinite(rawAmount) || rawAmount < 1000 || rawAmount > 1_000_000_000) {
      res.status(400).json({
        error: 'Virtual wallet amount must be between ₹1,000 and ₹100 Cr.',
      });
      return;
    }
    const outcome = saasStore.updateUserVirtualBalanceByAdmin(
      req.params.targetUserId,
      Math.round(rawAmount)
    );
    if (!outcome.ok || !outcome.user) {
      res
        .status(400)
        .json({ error: outcome.error || 'Could not update wallet balance.' });
      return;
    }
    res.json({
      ok: true,
      user: toPublicUser(outcome.user),
      paperWalletCapital: outcome.paperWalletCapital,
    });
  });

  app.patch('/api/admin/users/:targetUserId/status', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    const status: AccountStatus =
      req.body?.status === 'deactivated' ? 'deactivated' : 'active';
    const outcome = saasStore.setUserStatusByAdmin(
      req.params.targetUserId,
      status,
      user.id
    );
    if (!outcome.ok || !outcome.user) {
      res.status(400).json({ error: outcome.error || 'Could not update status.' });
      return;
    }
    res.json({ ok: true, user: toPublicUser(outcome.user) });
  });

  app.post(
    '/api/admin/users/:targetUserId/reset-password',
    (req: Request, res: Response) => {
      const user = getAuthenticatedUserFromReq(req);
      if (!user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      if (user.role !== 'owner') {
        res.status(403).json({ error: 'Admin access required.' });
        return;
      }
      const outcome = saasStore.resetUserPasswordToDefaultByAdmin(
        req.params.targetUserId,
        user.id
      );
      if (!outcome.ok || !outcome.user) {
        res
          .status(400)
          .json({ error: outcome.error || 'Could not reset password.' });
        return;
      }
      res.json({
        ok: true,
        user: toPublicUser(outcome.user),
        defaultPassword: outcome.defaultPassword,
      });
    }
  );

  app.patch(
    '/api/admin/users/:targetUserId/subscription',
    (req: Request, res: Response) => {
      const user = getAuthenticatedUserFromReq(req);
      if (!user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      if (user.role !== 'owner') {
        res.status(403).json({ error: 'Admin access required.' });
        return;
      }
      const validPlans: Array<Exclude<SubscriptionPlan, 'admin'>> = [
        '1m',
        '3m',
        '6m',
        '1y',
      ];
      const rawPlan = String(req.body?.subscriptionPlan || '');
      if (
        !validPlans.includes(rawPlan as Exclude<SubscriptionPlan, 'admin'>)
      ) {
        res.status(400).json({ error: 'Invalid subscription plan.' });
        return;
      }
      const mode = req.body?.mode === 'extend' ? 'extend' : 'from_now';
      const outcome = saasStore.updateUserSubscriptionByAdmin(
        req.params.targetUserId,
        rawPlan as Exclude<SubscriptionPlan, 'admin'>,
        mode
      );
      if (!outcome.ok || !outcome.user) {
        res
          .status(400)
          .json({ error: outcome.error || 'Could not update subscription.' });
        return;
      }
      res.json({ ok: true, user: toPublicUser(outcome.user) });
    }
  );

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
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Strategy configuration is Admin-only.' });
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

  app.put('/api/user/index-strategy', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Strategy configuration is Admin-only.' });
      return;
    }
    const rawSymbol = typeof req.body?.symbol === 'string' ? req.body.symbol : '';
    const config = req.body?.config;
    if (!rawSymbol.trim() || !config || typeof config !== 'object' || Array.isArray(config)) {
      res.status(400).json({ error: 'Valid symbol and strategy config object required.' });
      return;
    }
    const normalizedSymbol = normalizeFyersSymbol(rawSymbol);
    const current = saasStore.getWorkspace(user.id);
    const nextMap = {
      ...(current.perIndexConfigs ?? {}),
      [normalizedSymbol]: config as Record<string, unknown>,
    };
    const updated = saasStore.updateWorkspace(user.id, {
      perIndexConfigs: nextMap,
    });
    res.json({
      ok: true,
      symbol: normalizedSymbol,
      perIndexConfigs: updated.perIndexConfigs ?? {},
      updatedAt: updated.updatedAt,
    });
  });

  app.delete('/api/user/index-strategy', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Strategy configuration is Admin-only.' });
      return;
    }
    const rawSymbol =
      typeof req.query.symbol === 'string'
        ? req.query.symbol
        : typeof req.body?.symbol === 'string'
        ? req.body.symbol
        : '';
    if (!rawSymbol.trim()) {
      res.status(400).json({ error: 'Symbol is required.' });
      return;
    }
    const normalizedSymbol = normalizeFyersSymbol(rawSymbol);
    const current = saasStore.getWorkspace(user.id);
    const nextMap = { ...(current.perIndexConfigs ?? {}) };
    delete nextMap[normalizedSymbol];
    const updated = saasStore.updateWorkspace(user.id, {
      perIndexConfigs: nextMap,
    });
    res.json({
      ok: true,
      symbol: normalizedSymbol,
      perIndexConfigs: updated.perIndexConfigs ?? {},
      updatedAt: updated.updatedAt,
    });
  });

  app.put('/api/user/paper-wallet', (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const wallet = req.body?.wallet;
    if (!wallet || typeof wallet !== 'object' || Array.isArray(wallet)) {
      res.status(400).json({ error: 'Valid paper wallet object required.' });
      return;
    }
    const updated = saasStore.updateWorkspace(user.id, {
      paperWallet: wallet as Record<string, unknown>,
    });
    res.json({
      ok: true,
      paperWallet: updated.paperWallet,
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
      const pinInfo = isFyers
        ? resolveFyersPinForConnection(conn)
        : { pin: null, source: null };
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
        lastRefreshedAt: conn?.updatedAt ?? null,
        hasPin: Boolean(pinInfo.pin),
        pinSource: pinInfo.source,
        autoRefreshEnabled: Boolean(isFyers && conn?.refreshToken && pinInfo.pin),
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
    if (brokerId === 'fyers') {
      liveStreamManager.stopStream(user.id);
    }
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

  app.get('/api/fyers/status', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const creds = getFyersCredentials();
    const user = getAuthenticatedUserFromReq(req);
    let conn = user ? saasStore.getBrokerConnection(user.id, 'fyers') : null;
    const appUrl = getAppUrl(req);

    // Proactively refresh overnight/stale Fyers token so user doesn't have to re-login daily
    if (
      user &&
      creds &&
      conn &&
      isFyersTokenStaleForTodayIst(conn.updatedAt)
    ) {
      const { pin } = resolveFyersPinForConnection(conn);
      if (conn.refreshToken && pin) {
        const ok = await tryRefreshFyersConnection(user.id, conn, creds);
        if (ok) {
          conn = saasStore.getBrokerConnection(user.id, 'fyers');
        }
      }
    }

    const pinInfo = resolveFyersPinForConnection(conn);
    const streamSnapshot = user ? liveStreamManager.getSnapshot(user.id) : null;

    res.json({
      configured: Boolean(creds),
      appId: creds?.appId ?? null,
      authenticated: Boolean(conn),
      profile: conn?.profile ?? null,
      connectedAt: conn?.connectedAt ?? null,
      lastRefreshedAt: conn?.updatedAt ?? null,
      tokenStale: conn ? isFyersTokenStaleForTodayIst(conn.updatedAt) : false,
      hasPin: Boolean(pinInfo.pin),
      pinSource: pinInfo.source,
      autoRefreshEnabled: Boolean(conn?.refreshToken && pinInfo.pin),
      callbackUrl: `${appUrl}${fyersCallbackPath}`,
      istToday: getCurrentIstDateString(),
      activeStream: streamSnapshot
        ? {
            active: streamSnapshot.active,
            symbol: streamSnapshot.symbol,
            optionSymbol: streamSnapshot.optionSymbol,
            startedAt: streamSnapshot.startedAt,
            date: streamSnapshot.date,
          }
        : null,
    });
  });

  app.post('/api/fyers/pin', async (req: Request, res: Response) => {
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const rawPin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    const clear = Boolean(req.body?.clear);

    const existing = saasStore.getBrokerConnection(user.id, 'fyers');
    if (!existing) {
      res.status(400).json({ error: 'Connect your Fyers account first before saving your PIN.' });
      return;
    }

    if (clear) {
      saasStore.updateBrokerPin(user.id, 'fyers', null);
      const pinInfo = resolveFyersPinForConnection(
        saasStore.getBrokerConnection(user.id, 'fyers')
      );
      res.json({
        ok: true,
        hasPin: Boolean(pinInfo.pin),
        pinSource: pinInfo.source,
        autoRefreshEnabled: Boolean(existing.refreshToken && pinInfo.pin),
      });
      return;
    }

    if (!/^\d{4,6}$/.test(rawPin)) {
      res.status(400).json({ error: 'Enter your valid 4-digit numeric Fyers PIN.' });
      return;
    }

    const updated = saasStore.updateBrokerPin(user.id, 'fyers', rawPin);
    let refreshedNow = false;
    const creds = getFyersCredentials();
    if (updated && creds && updated.refreshToken) {
      refreshedNow = await tryRefreshFyersConnection(user.id, updated, creds);
    }

    const latest = saasStore.getBrokerConnection(user.id, 'fyers');
    const pinInfo = resolveFyersPinForConnection(latest);
    res.json({
      ok: true,
      refreshedNow,
      hasPin: Boolean(pinInfo.pin),
      pinSource: pinInfo.source,
      autoRefreshEnabled: Boolean(latest?.refreshToken && pinInfo.pin),
      lastRefreshedAt: latest?.updatedAt ?? null,
    });
  });

  // Persistent Server-Side Live Stream Controls (/api/fyers/stream/*)
  app.get('/api/fyers/stream/state', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    res.json(liveStreamManager.getSnapshot(user.id));
  });

  app.post('/api/fyers/stream/start', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const creds = getFyersCredentials();
    const entry = getUserFyersEntry(req);
    if (!creds || !entry) {
      res.status(401).json({ error: 'Connect your Fyers account first.' });
      return;
    }
    const rawSymbol =
      typeof req.body?.symbol === 'string' && req.body.symbol.trim()
        ? req.body.symbol
        : 'NSE:NIFTY50-INDEX';
    const rawOptionSymbol =
      typeof req.body?.optionSymbol === 'string'
        ? req.body.optionSymbol
        : req.body?.optionSymbol === null
        ? null
        : undefined;

    try {
      const snapshot = await liveStreamManager.startStream(
        entry.user.id,
        rawSymbol,
        rawOptionSymbol
      );
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error ? err.message : 'Could not start live stream.',
      });
    }
  });

  app.post('/api/fyers/stream/stop', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const snapshot = liveStreamManager.stopStream(user.id);
    res.json(snapshot);
  });

  app.post('/api/fyers/stream/option-symbol', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = getAuthenticatedUserFromReq(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const optionSymbol =
      typeof req.body?.optionSymbol === 'string' && req.body.optionSymbol.trim()
        ? req.body.optionSymbol.trim()
        : null;
    const snapshot = liveStreamManager.setOptionSymbol(user.id, optionSymbol);
    res.json(snapshot);
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
    const authUser = getAuthenticatedUserFromReq(req);
    if (!authUser) {
      res.status(401).json({ error: 'Sign in to NeoAlgo first.' });
      return;
    }

    const rawSymbol =
      typeof req.query.symbol === 'string' ? req.query.symbol : '';
    const symbol = normalizeFyersSymbol(rawSymbol);
    const todayIst = getCurrentIstDateString();
    const dateStr =
      typeof req.query.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(req.query.date.trim())
        ? req.query.date.trim()
        : todayIst;
    const forceRefresh =
      req.query.refresh === '1' || req.query.refresh === 'true';

    // Serve completed historical days directly from persistent disk DB without calling Fyers
    if (!forceRefresh) {
      const cached = candleStore.getCachedDay(
        symbol,
        dateStr,
        todayIst,
        isNseMarketClosedTodayIst()
      );
      if (cached.hit) {
        res.json({
          symbol,
          date: dateStr,
          candles: cached.candles,
          source: 'database',
        });
        return;
      }
    }

    const creds = getFyersCredentials();
    const entry = getUserFyersEntry(req);
    if (!creds || !entry) {
      res.status(401).json({
        error: `No cached data for ${symbol} on ${dateStr}. Connect your Fyers account to fetch it.`,
      });
      return;
    }

    try {
      const candles = await runWithFyersAutoRefresh(
        entry.user.id,
        entry.connection,
        creds,
        (token) => fetchFyersHistory(creds.appId, token, symbol, dateStr)
      );
      candleStore.upsertCandles(symbol, candles, {
        fromDate: dateStr,
        toDate: dateStr,
        todayIst,
      });
      res.json({ symbol, date: dateStr, candles, source: 'fyers' });
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
    const authUser = getAuthenticatedUserFromReq(req);
    if (!authUser) {
      res.status(401).json({ error: 'Sign in to NeoAlgo first.' });
      return;
    }

    const rawSymbol =
      typeof req.query.symbol === 'string' ? req.query.symbol : '';
    const symbol = normalizeFyersSymbol(rawSymbol);
    const todayIst = getCurrentIstDateString();
    const rawDays = Number(req.query.days) || 365;
    const days = Math.max(1, Math.min(366, rawDays));
    const toDate =
      typeof req.query.toDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(req.query.toDate)
        ? req.query.toDate
        : todayIst;
    const explicitFrom =
      typeof req.query.fromDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(req.query.fromDate)
        ? req.query.fromDate
        : null;
    const fromDate = explicitFrom || addDaysYYYYMMDD(toDate, -days);
    const forceRefresh =
      req.query.refresh === '1' || req.query.refresh === 'true';

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

    const marketClosedToday = isNseMarketClosedTodayIst();
    const existingBefore = candleStore.getRangeCandles(
      symbol,
      fromDate,
      toDate
    );
    const missingRanges = forceRefresh
      ? [{ fromDate, toDate }]
      : candleStore.getMissingRanges(
          symbol,
          fromDate,
          toDate,
          todayIst,
          marketClosedToday
        );

    // Everything requested is already stored in persistent local DB!
    if (missingRanges.length === 0) {
      const uniqueDays = new Set(existingBefore.map((c) => c.date)).size;
      res.json({
        symbol,
        fromDate,
        toDate,
        tradingDays: uniqueDays,
        totalCandles: existingBefore.length,
        candles: existingBefore,
        source: 'database',
        fetchedRanges: 0,
      });
      return;
    }

    const creds = getFyersCredentials();
    const entry = getUserFyersEntry(req);
    if (!creds || !entry) {
      res.status(401).json({
        error:
          'Connect your Fyers account to download the missing historical dates.',
      });
      return;
    }

    try {
      for (const gap of missingRanges) {
        const gapCandles = await runWithFyersAutoRefresh(
          entry.user.id,
          entry.connection,
          creds,
          (token) =>
            fetchFyersHistoryRange(
              creds.appId,
              token,
              symbol,
              gap.fromDate,
              gap.toDate
            )
        );
        candleStore.upsertCandles(symbol, gapCandles, {
          fromDate: gap.fromDate,
          toDate: gap.toDate,
          todayIst,
        });
      }

      const candles = candleStore.getRangeCandles(symbol, fromDate, toDate);
      const uniqueDays = new Set(candles.map((c) => c.date)).size;
      res.json({
        symbol,
        fromDate,
        toDate,
        tradingDays: uniqueDays,
        totalCandles: candles.length,
        candles,
        source:
          !forceRefresh && existingBefore.length > 0 ? 'hybrid' : 'fyers',
        fetchedRanges: missingRanges.length,
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

    const rawSymbol =
      typeof req.query.symbol === 'string' ? req.query.symbol : '';
    const symbol = normalizeFyersSymbol(rawSymbol);

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

  // Auto-fetch F&O Futures Lot Size, Strike Step & Expiries from Fyers daily Symbol Master
  app.get('/api/fyers/instrument-meta', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const authUser = getAuthenticatedUserFromReq(req);
    if (!authUser) {
      res.status(401).json({ error: 'Sign in to NeoAlgo first.' });
      return;
    }

    const rawSymbol =
      typeof req.query.symbol === 'string' ? req.query.symbol : '';
    try {
      const meta = await instrumentMaster.getInstrumentMeta(rawSymbol);
      res.json(meta);
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to resolve F&O instrument metadata',
      });
    }
  });

  // Lookup exact CE/PE option contract from Fyers Symbol Master + live option LTP if connected
  app.get('/api/fyers/option-pick', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const authUser = getAuthenticatedUserFromReq(req);
    if (!authUser) {
      res.status(401).json({ error: 'Sign in to NeoAlgo first.' });
      return;
    }

    const rawSymbol =
      typeof req.query.symbol === 'string' ? req.query.symbol : '';
    const strike = Number(req.query.strike);
    const optionType =
      String(req.query.optionType || '').toUpperCase() === 'PE' ? 'PE' : 'CE';
    const expiryChoice =
      req.query.expiry === 'next' ? 'next' : 'current';

    if (!Number.isFinite(strike) || strike <= 0) {
      res.status(400).json({ error: 'Valid numeric strike is required.' });
      return;
    }

    try {
      const contract = await instrumentMaster.lookupOptionContract({
        symbol: rawSymbol,
        strike,
        optionType,
        expiryChoice,
      });

      let liveLtp: number | null = null;
      let changePct: number | null = null;
      let volume: number | null = null;

      if (contract.fyersOptionSymbol) {
        const creds = getFyersCredentials();
        const entry = getUserFyersEntry(req);
        if (creds && entry) {
          try {
            const quote = await runWithFyersAutoRefresh(
              entry.user.id,
              entry.connection,
              creds,
              (token) =>
                fetchFyersQuote(
                  creds.appId,
                  token,
                  contract.fyersOptionSymbol as string
                )
            );
            if (typeof quote.ltp === 'number' && quote.ltp > 0) {
              liveLtp = quote.ltp;
              changePct = quote.changePct ?? null;
              volume = quote.volume ?? null;
            }
          } catch {
            // Gracefully return contract ticker without live LTP if token expired or off-hours
          }
        }
      }

      res.json({
        ...contract,
        liveLtp,
        changePct,
        volume,
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to look up option contract',
      });
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

  // Configure persistent server-side Fyers LiveStreamManager
  liveStreamManager.configure({
    fetchHistory: async (userId, symbol, dateStr) => {
      const creds = getFyersCredentials();
      const conn = saasStore.getBrokerConnection(userId, 'fyers');
      if (!creds || !conn) {
        throw new Error('Fyers account is not connected.');
      }
      return runWithFyersAutoRefresh(userId, conn, creds, (token) =>
        fetchFyersHistory(creds.appId, token, symbol, dateStr)
      );
    },
    fetchQuotesBatch: async (userId, symbols) => {
      const creds = getFyersCredentials();
      const conn = saasStore.getBrokerConnection(userId, 'fyers');
      if (!creds || !conn) {
        throw new Error('Fyers account is not connected.');
      }
      return runWithFyersAutoRefresh(userId, conn, creds, (token) =>
        fetchFyersQuotesBatch(creds.appId, token, symbols)
      );
    },
    getCurrentIstDate: getCurrentIstDateString,
    formatIstHHMM,
  });

  // Per-user Real-time Fyers WebSocket broadcaster (/ws/fyers)
  // Attaches to persistent server-side liveStreamManager so refreshing/closing browser never stops the stream!
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

    const userId = entry.user.id;
    liveStreamManager.attachClient(userId, ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          action?: string;
          symbol?: string;
          optionSymbol?: string | null;
        };
        if (msg.action === 'subscribe') {
          const sym = normalizeFyersSymbol(msg.symbol);
          void liveStreamManager
            .startStream(userId, sym, msg.optionSymbol)
            .then(() => {
              liveStreamManager.attachClient(userId, ws);
            });
        } else if (msg.action === 'set_option') {
          liveStreamManager.setOptionSymbol(userId, msg.optionSymbol ?? null);
        } else if (msg.action === 'unsubscribe') {
          liveStreamManager.stopStream(userId);
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      // Detach only — persistent server stream keeps running until explicitly stopped!
      liveStreamManager.detachClient(userId, ws);
    });
  });

  // Proactive daily Fyers token auto-refresh on boot & every 30 minutes
  void proactivelyRefreshStaleFyersConnections().then(() => {
    liveStreamManager.resumePersistedStreams();
  });
  setInterval(() => {
    void proactivelyRefreshStaleFyersConnections();
  }, 30 * 60 * 1000);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NeoAlgo SaaS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
