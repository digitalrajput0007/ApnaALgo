import https from 'https';

export type TelegramChatType = 'private' | 'group' | 'channel';

export type TelegramAlertEventType =
  | 'BIAS_CONFIRMED'
  | 'ENTRY_CONFIRMED'
  | 'SL_HIT'
  | 'TRAILED_COST_EXIT'
  | 'TARGET_HIT'
  | 'EOD_SQUARE_OFF'
  | 'TEST';

export interface TelegramDestination {
  id: string;
  label: string;
  chatId: string;
  type: TelegramChatType;
  enabled: boolean;
}

export interface TelegramTriggerFlags {
  biasConfirmed: boolean;
  entryConfirmed: boolean;
  slHit: boolean;
  targetHit: boolean;
  trailedCostExit: boolean;
  eodSquareOff: boolean;
}

export interface TelegramUserConfig {
  enabled: boolean;
  botToken: string;
  botUsername?: string;
  botFirstName?: string;
  destinations: TelegramDestination[];
  triggers: TelegramTriggerFlags;
  updatedAt: number;
}

export interface PublicTelegramUserConfig {
  enabled: boolean;
  hasBotToken: boolean;
  maskedToken: string | null;
  botUsername: string | null;
  botFirstName: string | null;
  destinations: TelegramDestination[];
  triggers: TelegramTriggerFlags;
  updatedAt: number;
}

export interface TelegramDeliveryResult {
  chatId: string;
  label: string;
  type: TelegramChatType;
  ok: boolean;
  messageId?: number;
  error?: string;
}

export interface TelegramDeliveryLogEntry {
  id: string;
  timestamp: string;
  eventType: TelegramAlertEventType;
  symbol: string;
  summary: string;
  totalTargets: number;
  deliveredCount: number;
  failedCount: number;
  results: TelegramDeliveryResult[];
}

export interface DiscoveredTelegramChat {
  chatId: string;
  title: string;
  username?: string;
  type: TelegramChatType;
}

export interface TelegramAlertPayload {
  eventKey: string;
  eventType: TelegramAlertEventType;
  symbol: string;
  sessionDate: string;
  time: string;
  isSample?: boolean;
  bias?: {
    direction: 'BULLISH' | 'BEARISH';
    setNumber: number;
    greenCount: number;
    redCount: number;
    rsiLength: number;
    rsiThreshold: number;
  };
  trade?: {
    id: number;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLossPrice: number;
    targetPrice: number;
    exitPrice?: number;
    signalRsi?: number;
    pnlPoints?: number;
    pnlRupees?: number;
    stopAfterTargetHit?: boolean;
    tradesUsed?: number;
    maxTradesPerDay?: number;
    lotQty?: number;
  };
}

export const DEFAULT_TELEGRAM_TRIGGERS: TelegramTriggerFlags = {
  biasConfirmed: true,
  entryConfirmed: true,
  slHit: true,
  targetHit: true,
  trailedCostExit: true,
  eodSquareOff: false,
};

export function createDefaultTelegramConfig(): TelegramUserConfig {
  return {
    enabled: false,
    botToken: '',
    destinations: [],
    triggers: { ...DEFAULT_TELEGRAM_TRIGGERS },
    updatedAt: 0,
  };
}

export function maskTelegramToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0 && trimmed.length > colonIdx + 8) {
    const botId = trimmed.slice(0, colonIdx);
    const tail = trimmed.slice(-5);
    return `${botId}:••••••••••••${tail}`;
  }
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••${trimmed.slice(-4)}`;
}

export function toPublicTelegramConfig(
  cfg: TelegramUserConfig
): PublicTelegramUserConfig {
  return {
    enabled: cfg.enabled,
    hasBotToken: Boolean(cfg.botToken?.trim()),
    maskedToken: maskTelegramToken(cfg.botToken || ''),
    botUsername: cfg.botUsername ?? null,
    botFirstName: cfg.botFirstName ?? null,
    destinations: cfg.destinations,
    triggers: {
      ...DEFAULT_TELEGRAM_TRIGGERS,
      ...cfg.triggers,
    },
    updatedAt: cfg.updatedAt,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatInr(amount: number): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}₹${Math.abs(Math.round(amount)).toLocaleString('en-IN')}`;
}

export function isTriggerEnabledForEvent(
  triggers: TelegramTriggerFlags,
  eventType: TelegramAlertEventType
): boolean {
  switch (eventType) {
    case 'BIAS_CONFIRMED':
      return triggers.biasConfirmed;
    case 'ENTRY_CONFIRMED':
      return triggers.entryConfirmed;
    case 'SL_HIT':
      return triggers.slHit;
    case 'TRAILED_COST_EXIT':
      return triggers.trailedCostExit;
    case 'TARGET_HIT':
      return triggers.targetHit;
    case 'EOD_SQUARE_OFF':
      return triggers.eodSquareOff;
    case 'TEST':
      return true;
  }
}

export function formatTelegramAlertHtml(payload: TelegramAlertPayload): string {
  const sym = escapeHtml(payload.symbol);
  const dt = escapeHtml(payload.sessionDate);
  const tm = escapeHtml(payload.time);
  const sampleTag = payload.isSample ? ' [SAMPLE]' : '';

  if (payload.eventType === 'BIAS_CONFIRMED' && payload.bias) {
    const isBull = payload.bias.direction === 'BULLISH';
    const watchText = isBull
      ? `RSI(${payload.bias.rsiLength}) &lt; ${payload.bias.rsiThreshold} → Long Breakout`
      : `RSI(${payload.bias.rsiLength}) &gt; ${payload.bias.rsiThreshold} → Short Breakdown`;

    return [
      `<b>NeoAlgo · BIAS CONFIRMED${sampleTag}</b>`,
      `<b>Direction:</b> ${isBull ? 'BULLISH (Long Only)' : 'BEARISH (Short Only)'}`,
      `<b>Symbol:</b> <code>${sym}</code>`,
      `<b>Confirmed:</b> Set #${payload.bias.setNumber} (${payload.bias.greenCount}G / ${payload.bias.redCount}R) at ${tm} IST`,
      `<b>Next Watch:</b> ${watchText}`,
      `<i>Session: ${dt}</i>`,
    ].join('\n');
  }

  if (payload.eventType === 'ENTRY_CONFIRMED' && payload.trade) {
    const t = payload.trade;
    const riskPts = Math.abs(t.entryPrice - t.stopLossPrice);
    const rewardPts = Math.abs(t.targetPrice - t.entryPrice);
    const rr = riskPts > 0 ? (rewardPts / riskPts).toFixed(2) : '0.00';

    return [
      `<b>NeoAlgo · ENTRY CONFIRMED${sampleTag}</b>`,
      `<b>Trade #${t.id}:</b> ${t.direction} <code>${sym}</code>`,
      `<b>Entry:</b> <code>${t.entryPrice.toFixed(2)}</code> at ${tm} IST`,
      `<b>Stop Loss:</b> <code>${t.stopLossPrice.toFixed(2)}</code> (-${riskPts.toFixed(1)} pts)`,
      `<b>Target:</b> <code>${t.targetPrice.toFixed(2)}</code> (+${rewardPts.toFixed(1)} pts · 1:${rr} RR)`,
      t.signalRsi !== undefined
        ? `<b>Signal RSI:</b> ${t.signalRsi.toFixed(2)}${t.lotQty ? ` · Qty: ${t.lotQty}` : ''}`
        : null,
      `<i>Session: ${dt}</i>`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (payload.eventType === 'TARGET_HIT' && payload.trade) {
    const t = payload.trade;
    const pts = t.pnlPoints ?? 0;
    const inr = t.pnlRupees ?? 0;

    return [
      `<b>NeoAlgo · TARGET HIT${sampleTag}</b>`,
      `<b>Trade #${t.id}:</b> ${t.direction} <code>${sym}</code>`,
      `<b>Entry → Exit:</b> <code>${t.entryPrice.toFixed(2)}</code> → <code>${(
        t.exitPrice ?? t.targetPrice
      ).toFixed(2)}</code>`,
      `<b>Realized P&amp;L:</b> <b>+${pts.toFixed(1)} pts (${formatInr(inr)})</b>`,
      `<b>Time:</b> ${tm} IST (${dt})`,
      t.stopAfterTargetHit
        ? `<i>Rule Active: Target achieved — no further trades for today.</i>`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (
    (payload.eventType === 'SL_HIT' ||
      payload.eventType === 'TRAILED_COST_EXIT') &&
    payload.trade
  ) {
    const t = payload.trade;
    const pts = t.pnlPoints ?? 0;
    const inr = t.pnlRupees ?? 0;
    const isCost = payload.eventType === 'TRAILED_COST_EXIT';
    const remaining =
      t.maxTradesPerDay !== undefined && t.tradesUsed !== undefined
        ? Math.max(0, t.maxTradesPerDay - t.tradesUsed)
        : null;

    return [
      `<b>NeoAlgo · ${isCost ? 'BREAKEVEN TRAIL EXIT' : 'STOP LOSS HIT'}${sampleTag}</b>`,
      `<b>Trade #${t.id}:</b> ${t.direction} <code>${sym}</code>`,
      `<b>Entry → Exit:</b> <code>${t.entryPrice.toFixed(2)}</code> → <code>${(
        t.exitPrice ?? t.stopLossPrice
      ).toFixed(2)}</code>`,
      `<b>Realized P&amp;L:</b> <b>${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts (${formatInr(inr)})</b>`,
      `<b>Time:</b> ${tm} IST (${dt})`,
      remaining !== null
        ? remaining > 0
          ? `<i>Remaining setups allowed today: ${remaining} of ${t.maxTradesPerDay}</i>`
          : `<i>Max daily trade limit (${t.maxTradesPerDay}) reached for today.</i>`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (payload.eventType === 'EOD_SQUARE_OFF' && payload.trade) {
    const t = payload.trade;
    const pts = t.pnlPoints ?? 0;
    const inr = t.pnlRupees ?? 0;
    return [
      `<b>NeoAlgo · EOD SQUARE-OFF${sampleTag}</b>`,
      `<b>Trade #${t.id}:</b> ${t.direction} <code>${sym}</code>`,
      `<b>Entry → Close:</b> <code>${t.entryPrice.toFixed(2)}</code> → <code>${(
        t.exitPrice ?? t.entryPrice
      ).toFixed(2)}</code>`,
      `<b>P&amp;L:</b> <b>${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts (${formatInr(inr)})</b>`,
      `<b>Time:</b> ${tm} IST (${dt})`,
    ].join('\n');
  }

  return [
    `<b>NeoAlgo · Telegram Alert Connected</b>`,
    `<b>Symbol:</b> <code>${sym}</code>`,
    `<b>Status:</b> Live notifications ready for Bias, Entry, Stop Loss, and Target confirmations.`,
    `<i>Sent at ${tm} IST (${dt})</i>`,
  ].join('\n');
}

function normalizeTelegramToken(raw: string): string {
  return raw.trim().replace(/^bot(?=\d+:)/i, '');
}

interface TelegramApiResponse<T> {
  statusCode: number;
  data: {
    ok?: boolean;
    description?: string;
    result?: T;
  };
}

function telegramHttpsRequest<T>(
  rawToken: string,
  endpoint: string,
  payload?: Record<string, unknown>
): Promise<TelegramApiResponse<T>> {
  const token = normalizeTelegramToken(rawToken);
  const bodyStr = payload ? JSON.stringify(payload) : null;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${encodeURIComponent(token)}/${endpoint}`,
        method: bodyStr ? 'POST' : 'GET',
        family: 4,
        timeout: 15000,
        headers: bodyStr
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr),
            }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            const parsed = JSON.parse(raw) as TelegramApiResponse<T>['data'];
            resolve({
              statusCode: res.statusCode ?? 0,
              data: parsed,
            });
          } catch {
            reject(
              new Error(
                `Unexpected non-JSON response from Telegram (HTTP ${res.statusCode ?? 0})`
              )
            );
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Connection to api.telegram.org timed out (15s).'));
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      const code = err.code ? ` (${err.code})` : '';
      reject(new Error(`Telegram API network error${code}: ${err.message}`));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

export async function verifyTelegramBotToken(botToken: string): Promise<{
  ok: boolean;
  username?: string;
  firstName?: string;
  error?: string;
}> {
  const token = normalizeTelegramToken(botToken);
  if (!token || !token.includes(':')) {
    return {
      ok: false,
      error: 'Invalid bot token format. Copy the full token from @BotFather.',
    };
  }

  try {
    const { statusCode, data } = await telegramHttpsRequest<{
      username?: string;
      first_name?: string;
    }>(token, 'getMe');
    if (statusCode < 200 || statusCode >= 300 || !data.ok || !data.result) {
      return {
        ok: false,
        error: data.description || `Telegram rejected token (${statusCode})`,
      };
    }
    return {
      ok: true,
      username: data.result.username,
      firstName: data.result.first_name,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not reach Telegram Bot API.',
    };
  }
}

export async function discoverTelegramChats(botToken: string): Promise<{
  ok: boolean;
  chats: DiscoveredTelegramChat[];
  error?: string;
}> {
  const token = normalizeTelegramToken(botToken);
  if (!token) {
    return { ok: false, chats: [], error: 'Bot token is required first.' };
  }

  try {
    const { statusCode, data } = await telegramHttpsRequest<
      Array<{
        message?: { chat?: RawTgChat };
        edited_message?: { chat?: RawTgChat };
        channel_post?: { chat?: RawTgChat };
        edited_channel_post?: { chat?: RawTgChat };
        my_chat_member?: { chat?: RawTgChat };
      }>
    >(token, 'getUpdates?limit=50');

    if (statusCode < 200 || statusCode >= 300 || !data.ok) {
      return {
        ok: false,
        chats: [],
        error: data.description || `Telegram getUpdates error (${statusCode})`,
      };
    }

    const found = new Map<string, DiscoveredTelegramChat>();
    for (const upd of data.result || []) {
      const rawChat =
        upd.message?.chat ||
        upd.edited_message?.chat ||
        upd.channel_post?.chat ||
        upd.edited_channel_post?.chat ||
        upd.my_chat_member?.chat;
      if (!rawChat || rawChat.id === undefined) continue;

      const chatId = String(rawChat.id);
      const mappedType: TelegramChatType =
        rawChat.type === 'channel'
          ? 'channel'
          : rawChat.type === 'group' || rawChat.type === 'supergroup'
          ? 'group'
          : 'private';
      const title =
        rawChat.title ||
        [rawChat.first_name, rawChat.last_name].filter(Boolean).join(' ') ||
        (rawChat.username ? `@${rawChat.username}` : chatId);

      found.set(chatId, {
        chatId,
        title,
        username: rawChat.username,
        type: mappedType,
      });
    }

    return { ok: true, chats: Array.from(found.values()) };
  } catch (err) {
    return {
      ok: false,
      chats: [],
      error:
        err instanceof Error ? err.message : 'Failed to query Telegram updates.',
    };
  }
}

interface RawTgChat {
  id: number | string;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export async function sendTelegramHtmlMessage(
  botToken: string,
  destination: TelegramDestination,
  htmlText: string
): Promise<TelegramDeliveryResult> {
  try {
    const { statusCode, data } = await telegramHttpsRequest<{
      message_id?: number;
    }>(botToken, 'sendMessage', {
      chat_id: destination.chatId.trim(),
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    if (statusCode < 200 || statusCode >= 300 || !data.ok) {
      return {
        chatId: destination.chatId,
        label: destination.label,
        type: destination.type,
        ok: false,
        error: data.description || `HTTP ${statusCode}`,
      };
    }

    return {
      chatId: destination.chatId,
      label: destination.label,
      type: destination.type,
      ok: true,
      messageId: data.result?.message_id,
    };
  } catch (err) {
    return {
      chatId: destination.chatId,
      label: destination.label,
      type: destination.type,
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}
