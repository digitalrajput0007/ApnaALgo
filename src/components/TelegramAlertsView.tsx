import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import {
  DiscoveredTelegramChat,
  TelegramAlertEventType,
  TelegramAlertPayload,
  TelegramAlertsController,
  TelegramChatType,
  TelegramDestination,
  TelegramTriggerFlags,
} from '../hooks/useTelegramAlerts';
import { StrategyConfig } from '../types/strategy';

interface TelegramAlertsViewProps {
  telegram: TelegramAlertsController;
  strategyConfig: StrategyConfig;
  isLiveStreaming: boolean;
  activeSymbol: string;
  onGoToLab: () => void;
}

type PreviewEventTab =
  | 'BIAS_CONFIRMED'
  | 'ENTRY_CONFIRMED'
  | 'TARGET_HIT'
  | 'SL_HIT';

function chatTypeLabel(type: TelegramChatType): string {
  if (type === 'channel') return 'Channel';
  if (type === 'group') return 'Group';
  return 'Personal';
}

function ChatTypeIcon({ type }: { type: TelegramChatType }) {
  if (type === 'channel') {
    return (
      <Megaphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
    );
  }
  if (type === 'group') {
    return (
      <Users className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 shrink-0" />
    );
  }
  return (
    <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
  );
}

export const TelegramAlertsView: React.FC<TelegramAlertsViewProps> = ({
  telegram,
  strategyConfig,
  isLiveStreaming,
  activeSymbol,
  onGoToLab,
}) => {
  const [enabled, setEnabled] = useState<boolean>(telegram.config.enabled);
  const [botTokenInput, setBotTokenInput] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [destinations, setDestinations] = useState<TelegramDestination[]>(
    telegram.config.destinations
  );
  const [triggers, setTriggers] = useState<TelegramTriggerFlags>(
    telegram.config.triggers
  );

  // Add destination form
  const [newLabel, setNewLabel] = useState<string>('');
  const [newChatId, setNewChatId] = useState<string>('');
  const [newType, setNewType] = useState<TelegramChatType>('private');

  // Discovery & feedback
  const [discoveredChats, setDiscoveredChats] = useState<
    DiscoveredTelegramChat[]
  >([]);
  const [discoverInfo, setDiscoverInfo] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [previewEvent, setPreviewEvent] =
    useState<PreviewEventTab>('ENTRY_CONFIRMED');

  useEffect(() => {
    setEnabled(telegram.config.enabled);
    setDestinations(telegram.config.destinations);
    setTriggers(telegram.config.triggers);
  }, [telegram.config]);

  const hasUnsavedChanges = useMemo(() => {
    if (botTokenInput.trim().length > 0) return true;
    if (enabled !== telegram.config.enabled) return true;
    if (
      JSON.stringify(destinations) !==
      JSON.stringify(telegram.config.destinations)
    ) {
      return true;
    }
    if (
      JSON.stringify(triggers) !== JSON.stringify(telegram.config.triggers)
    ) {
      return true;
    }
    return false;
  }, [botTokenInput, enabled, destinations, triggers, telegram.config]);

  const handleSave = async () => {
    setFeedback(null);
    const res = await telegram.saveConfig({
      enabled,
      botToken: botTokenInput.trim() || undefined,
      destinations,
      triggers,
    });
    if (res.ok) {
      setBotTokenInput('');
      setFeedback({
        kind: 'success',
        text: 'Telegram alert configuration encrypted and saved to your account.',
      });
    } else {
      setFeedback({
        kind: 'error',
        text: res.error || 'Could not save Telegram settings.',
      });
    }
  };

  const handleClearToken = async () => {
    setFeedback(null);
    const res = await telegram.saveConfig({
      clearBotToken: true,
      enabled: false,
    });
    if (res.ok) {
      setBotTokenInput('');
      setFeedback({
        kind: 'success',
        text: 'Stored Telegram Bot Token removed from your account.',
      });
    }
  };

  const handleAddDestination = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = newChatId.trim();
    if (!trimmedId) return;
    if (destinations.some((d) => d.chatId === trimmedId)) {
      setFeedback({
        kind: 'error',
        text: `Chat ID ${trimmedId} is already in your destinations list.`,
      });
      return;
    }
    const inferredType: TelegramChatType =
      newType === 'private' && trimmedId.startsWith('@')
        ? 'channel'
        : newType;
    const next: TelegramDestination = {
      id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: newLabel.trim() || `${chatTypeLabel(inferredType)} (${trimmedId})`,
      chatId: trimmedId,
      type: inferredType,
      enabled: true,
    };
    setDestinations((prev) => [...prev, next]);
    setNewLabel('');
    setNewChatId('');
    setFeedback(null);
  };

  const handleAddDiscoveredChat = (chat: DiscoveredTelegramChat) => {
    if (destinations.some((d) => d.chatId === chat.chatId)) return;
    setDestinations((prev) => [
      ...prev,
      {
        id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        label: chat.title,
        chatId: chat.chatId,
        type: chat.type,
        enabled: true,
      },
    ]);
    setFeedback(null);
  };

  const handleDiscoverChats = async () => {
    setFeedback(null);
    setDiscoverInfo(null);
    const res = await telegram.discoverChats(botTokenInput.trim() || undefined);
    if (!res.ok) {
      setFeedback({
        kind: 'error',
        text: res.error || 'Could not detect chats from Telegram.',
      });
      return;
    }
    setDiscoveredChats(res.chats);
    if (res.chats.length === 0) {
      setDiscoverInfo(
        'No recent chats found. Send "/start" to your bot in a Personal DM, add the bot to a Group and post a message, or post once in your Channel after adding the bot as an Admin — then click Detect again.'
      );
    } else {
      setDiscoverInfo(
        `Detected ${res.chats.length} Telegram chat${
          res.chats.length === 1 ? '' : 's'
        }. Click Add on any destination below, then Save Configuration.`
      );
    }
  };

  const buildSamplePayload = (
    eventType: PreviewEventTab
  ): TelegramAlertPayload => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const entry = 24820.5;
    const sl = entry - strategyConfig.stopLossPoints;
    const tgt = entry + strategyConfig.targetPoints;
    const qty = strategyConfig.lotSize * strategyConfig.lots;

    if (eventType === 'BIAS_CONFIRMED') {
      return {
        eventKey: `sample_bias_${Date.now()}`,
        eventType: 'BIAS_CONFIRMED',
        symbol: activeSymbol,
        sessionDate: today,
        time: '09:35',
        isSample: true,
        bias: {
          direction: 'BULLISH',
          setNumber: 1,
          greenCount: 3,
          redCount: 1,
          rsiLength: strategyConfig.rsiLength,
          rsiThreshold: strategyConfig.rsiBuyThreshold,
        },
      };
    }

    if (eventType === 'ENTRY_CONFIRMED') {
      return {
        eventKey: `sample_entry_${Date.now()}`,
        eventType: 'ENTRY_CONFIRMED',
        symbol: activeSymbol,
        sessionDate: today,
        time: '10:15',
        isSample: true,
        trade: {
          id: 1,
          direction: 'LONG',
          entryPrice: entry,
          stopLossPrice: sl,
          targetPrice: tgt,
          signalRsi: Math.max(2, strategyConfig.rsiBuyThreshold - 4.2),
          lotQty: qty,
        },
      };
    }

    if (eventType === 'TARGET_HIT') {
      return {
        eventKey: `sample_target_${Date.now()}`,
        eventType: 'TARGET_HIT',
        symbol: activeSymbol,
        sessionDate: today,
        time: '11:05',
        isSample: true,
        trade: {
          id: 1,
          direction: 'LONG',
          entryPrice: entry,
          stopLossPrice: sl,
          targetPrice: tgt,
          exitPrice: tgt,
          pnlPoints: strategyConfig.targetPoints,
          pnlRupees: strategyConfig.targetPoints * qty,
          stopAfterTargetHit: strategyConfig.stopAfterTargetHit,
          lotQty: qty,
        },
      };
    }

    return {
      eventKey: `sample_sl_${Date.now()}`,
      eventType: 'SL_HIT',
      symbol: activeSymbol,
      sessionDate: today,
      time: '10:35',
      isSample: true,
      trade: {
        id: 1,
        direction: 'LONG',
        entryPrice: entry,
        stopLossPrice: sl,
        targetPrice: tgt,
        exitPrice: sl,
        pnlPoints: -strategyConfig.stopLossPoints,
        pnlRupees: -strategyConfig.stopLossPoints * qty,
        tradesUsed: 1,
        maxTradesPerDay: strategyConfig.maxTradesPerDay,
        lotQty: qty,
      },
    };
  };

  const handleSendSample = async (chatId?: string) => {
    setFeedback(null);
    if (hasUnsavedChanges) {
      const saved = await telegram.saveConfig({
        enabled,
        botToken: botTokenInput.trim() || undefined,
        destinations,
        triggers,
      });
      if (!saved.ok) {
        setFeedback({
          kind: 'error',
          text: saved.error || 'Save your Telegram settings first.',
        });
        return;
      }
      setBotTokenInput('');
    }

    const res = await telegram.sendTestAlert({
      chatId,
      samplePayload: chatId ? undefined : buildSamplePayload(previewEvent),
    });

    if (res.ok) {
      setFeedback({
        kind: 'success',
        text: `Delivered to ${res.deliveredCount} Telegram chat${
          res.deliveredCount === 1 ? '' : 's'
        }${res.failedCount > 0 ? ` (${res.failedCount} failed — see log)` : ''}.`,
      });
    } else {
      const firstErr = res.results.find((r) => !r.ok)?.error || res.error;
      setFeedback({
        kind: 'error',
        text: firstErr || 'Telegram delivery failed.',
      });
    }
  };

  const previewLines = useMemo(() => {
    const qty = strategyConfig.lotSize * strategyConfig.lots;
    const entry = 24820.5;
    const sl = entry - strategyConfig.stopLossPoints;
    const tgt = entry + strategyConfig.targetPoints;
    const rr =
      strategyConfig.stopLossPoints > 0
        ? (strategyConfig.targetPoints / strategyConfig.stopLossPoints).toFixed(
            2
          )
        : '0.00';

    if (previewEvent === 'BIAS_CONFIRMED') {
      return [
        { bold: true, text: 'NeoAlgo · BIAS CONFIRMED' },
        { text: 'Direction: BULLISH (Long Only)' },
        { text: `Symbol: ${activeSymbol}` },
        { text: 'Confirmed: Set #1 (3G / 1R) at 09:35 IST' },
        {
          text: `Next Watch: RSI(${strategyConfig.rsiLength}) < ${strategyConfig.rsiBuyThreshold} → Long Breakout`,
        },
      ];
    }
    if (previewEvent === 'ENTRY_CONFIRMED') {
      return [
        { bold: true, text: 'NeoAlgo · ENTRY CONFIRMED' },
        { text: `Trade #1: LONG ${activeSymbol}` },
        { text: `Entry: ${entry.toFixed(2)} at 10:15 IST` },
        {
          text: `Stop Loss: ${sl.toFixed(2)} (-${strategyConfig.stopLossPoints} pts)`,
        },
        {
          text: `Target: ${tgt.toFixed(2)} (+${strategyConfig.targetPoints} pts · 1:${rr} RR)`,
        },
        {
          text: `Signal RSI: ${(strategyConfig.rsiBuyThreshold - 4.2).toFixed(
            2
          )} · Qty: ${qty}`,
        },
      ];
    }
    if (previewEvent === 'TARGET_HIT') {
      return [
        { bold: true, text: 'NeoAlgo · TARGET HIT' },
        { text: `Trade #1: LONG ${activeSymbol}` },
        { text: `Entry → Exit: ${entry.toFixed(2)} → ${tgt.toFixed(2)}` },
        {
          text: `Realized P&L: +${strategyConfig.targetPoints.toFixed(
            1
          )} pts (+₹${(strategyConfig.targetPoints * qty).toLocaleString(
            'en-IN'
          )})`,
        },
        {
          text: strategyConfig.stopAfterTargetHit
            ? 'Rule Active: Target achieved — no further trades for today.'
            : 'Time: 11:05 IST',
        },
      ];
    }
    return [
      { bold: true, text: 'NeoAlgo · STOP LOSS HIT' },
      { text: `Trade #1: LONG ${activeSymbol}` },
      { text: `Entry → Exit: ${entry.toFixed(2)} → ${sl.toFixed(2)}` },
      {
        text: `Realized P&L: -${strategyConfig.stopLossPoints.toFixed(
          1
        )} pts (-₹${(strategyConfig.stopLossPoints * qty).toLocaleString(
          'en-IN'
        )})`,
      },
      {
        text: `Remaining setups allowed today: ${Math.max(
          0,
          strategyConfig.maxTradesPerDay - 1
        )} of ${strategyConfig.maxTradesPerDay}`,
      },
    ];
  }, [previewEvent, strategyConfig, activeSymbol]);

  const triggerDefinitions: {
    key: keyof TelegramTriggerFlags;
    title: string;
    description: string;
  }[] = [
    {
      key: 'biasConfirmed',
      title: 'Bias Confirmed',
      description:
        'Alert as soon as the 4-candle Bullish or Bearish majority locks in for the session.',
    },
    {
      key: 'entryConfirmed',
      title: 'Entry Confirmed',
      description:
        'Alert immediately when RSI zone + breakout buffer executes a Long or Short entry with SL & Target.',
    },
    {
      key: 'slHit',
      title: 'Stop Loss Hit',
      description:
        'Alert when strict stop loss exits a trade, showing realized loss and remaining daily setups.',
    },
    {
      key: 'targetHit',
      title: 'Target Hit',
      description:
        'Alert when full target is achieved, showing P&L and confirming day-end trading halt.',
    },
    {
      key: 'trailedCostExit',
      title: '1:1 Breakeven Trail Exit',
      description:
        'Alert if a trade exits at cost after reaching 1:1 and trailing stop loss to entry.',
    },
    {
      key: 'eodSquareOff',
      title: 'EOD Square-Off',
      description:
        'Alert if an open trade is squared off at market close time.',
    },
  ];

  const eventLabel = (evt: TelegramAlertEventType) => {
    switch (evt) {
      case 'BIAS_CONFIRMED':
        return 'Bias Confirmed';
      case 'ENTRY_CONFIRMED':
        return 'Entry Confirmed';
      case 'SL_HIT':
        return 'Stop Loss Hit';
      case 'TRAILED_COST_EXIT':
        return 'Cost Trail Exit';
      case 'TARGET_HIT':
        return 'Target Hit';
      case 'EOD_SQUARE_OFF':
        return 'EOD Square-Off';
      case 'TEST':
        return 'Test Alert';
    }
  };

  const fieldCls =
    'px-3 py-2 text-xs text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-[#161D2B] placeholder:text-slate-400 dark:placeholder:text-slate-500';

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Telegram Signal Alerts
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Dispatch real-time notifications to personal DMs, groups, or
            channels the instant Bias, Entry, Stop Loss, or Target confirms.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-2.5 px-3.5 py-2 bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
            />
            <span>{enabled ? 'Live Alerts Enabled' : 'Live Alerts Paused'}</span>
          </label>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={telegram.saving || !hasUnsavedChanges}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-45 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {telegram.saving ? 'Saving...' : 'Save Configuration'}
            </span>
          </button>
        </div>
      </section>

      {/* Top Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Telegram Bot
          </div>
          <div className="mt-1.5 font-display text-base font-bold text-slate-900 dark:text-slate-100 truncate">
            {telegram.config.hasBotToken
              ? telegram.config.botUsername
                ? `@${telegram.config.botUsername}`
                : 'Bot Token Saved'
              : 'Not Configured'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono truncate">
            {telegram.config.maskedToken || 'Paste token from @BotFather'}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Active Destinations
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
            {destinations.filter((d) => d.enabled).length}{' '}
            <span className="text-xs font-sans font-normal text-slate-500 dark:text-slate-400">
              / {destinations.length} saved
            </span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Personal, Group, and Channel targets
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Live Stream Dispatch
          </div>
          <div
            className={`mt-1.5 font-display text-base font-bold ${
              telegram.isArmedForLive && isLiveStreaming
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            {telegram.isArmedForLive && isLiveStreaming
              ? 'Armed & Listening'
              : telegram.isArmedForLive
              ? 'Armed (Start Live Stream)'
              : 'Standby'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isLiveStreaming ? (
              `Monitoring ${activeSymbol}`
            ) : (
              <button
                type="button"
                onClick={onGoToLab}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer"
              >
                Open Strategy Lab to start feed
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Token Security
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 font-display text-base font-bold text-slate-900 dark:text-slate-100">
            <ShieldCheck
              className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"
              aria-hidden="true"
            />
            <span>AES-256-GCM</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Per-user encrypted on VPS · Dedup active
          </div>
        </div>
      </section>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-lg border text-xs flex items-center gap-2 ${
            feedback.kind === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.95fr] gap-6 items-start">
        {/* Left Column: Bot Token, Destinations, Triggers */}
        <div className="space-y-6">
          {/* 1. Bot Token Setup */}
          <section className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  1. Telegram Bot Token
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Create a bot via <span className="font-mono">@BotFather</span>{' '}
                  in Telegram (<span className="font-mono">/newbot</span>) and
                  paste the HTTP API token below.
                </p>
              </div>
              {telegram.config.hasBotToken && (
                <button
                  type="button"
                  onClick={() => void handleClearToken()}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
                >
                  Remove Saved Token
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={botTokenInput}
                  onChange={(e) => setBotTokenInput(e.target.value)}
                  placeholder={
                    telegram.config.hasBotToken
                      ? `Saved (${telegram.config.maskedToken}) — enter new token to replace`
                      : '1234567890:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                  }
                  className={`w-full px-3.5 py-2.5 pr-10 font-mono ${fieldCls}`}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showToken ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleDiscoverChats()}
                disabled={
                  telegram.discovering ||
                  (!botTokenInput.trim() && !telegram.config.hasBotToken)
                }
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    telegram.discovering ? 'animate-spin' : ''
                  }`}
                  aria-hidden="true"
                />
                <span>Detect Chats</span>
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-1.5">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Quick setup for Personal DM, Group, or Channel
              </div>
              <div>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Personal DM:
                </span>{' '}
                Open your bot in Telegram and send{' '}
                <span className="font-mono">/start</span>, then click{' '}
                <span className="font-medium">Detect Chats</span>.
              </div>
              <div>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Group:
                </span>{' '}
                Add your bot to the group, send any message, then click{' '}
                <span className="font-medium">Detect Chats</span> (ID starts
                with <span className="font-mono">-</span> or{' '}
                <span className="font-mono">-100</span>).
              </div>
              <div>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Channel:
                </span>{' '}
                Add your bot as a Channel Administrator with{' '}
                <span className="font-medium">Post Messages</span> permission.
                Use public <span className="font-mono">@channelusername</span>{' '}
                or post once in a private channel and click{' '}
                <span className="font-medium">Detect Chats</span>.
              </div>
            </div>

            {discoverInfo && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {discoverInfo}
              </p>
            )}

            {discoveredChats.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                {discoveredChats.map((chat) => {
                  const alreadyAdded = destinations.some(
                    (d) => d.chatId === chat.chatId
                  );
                  return (
                    <div
                      key={chat.chatId}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ChatTypeIcon type={chat.type} />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {chat.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                            {chatTypeLabel(chat.type)} · {chat.chatId}
                            {chat.username ? ` · @${chat.username}` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => handleAddDiscoveredChat(chat)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161D2B] hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-800 dark:text-slate-200 whitespace-nowrap cursor-pointer"
                      >
                        {alreadyAdded ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 2. Target Destinations */}
          <section className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                2. Target Destinations
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Send alerts simultaneously to your personal Telegram, a trading
                team group, or a broadcast channel.
              </p>
            </div>

            <form
              onSubmit={handleAddDestination}
              className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_115px_auto] gap-2"
            >
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (e.g. NIFTY Signals Channel)"
                className={fieldCls}
              />
              <input
                type="text"
                value={newChatId}
                onChange={(e) => setNewChatId(e.target.value)}
                placeholder="Chat ID (-100...) or @channel"
                required
                className={`font-mono ${fieldCls}`}
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as TelegramChatType)}
                className={fieldCls}
              >
                <option value="private">Personal</option>
                <option value="group">Group</option>
                <option value="channel">Channel</option>
              </select>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add</span>
              </button>
            </form>

            {destinations.length === 0 ? (
              <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg py-6 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                No Telegram destinations configured yet. Use{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  Detect Chats
                </span>{' '}
                above or enter a numeric Chat ID /{' '}
                <span className="font-mono">@channel</span> manually.
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                {destinations.map((dest) => (
                  <div
                    key={dest.id}
                    className="px-3.5 py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <label className="flex items-center gap-3 min-w-0 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={dest.enabled}
                        onChange={(e) =>
                          setDestinations((prev) =>
                            prev.map((d) =>
                              d.id === dest.id
                                ? { ...d, enabled: e.target.checked }
                                : d
                            )
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 shrink-0"
                      />
                      <ChatTypeIcon type={dest.type} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {dest.label}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          {chatTypeLabel(dest.type)} · {dest.chatId}
                        </div>
                      </div>
                    </label>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={telegram.testing}
                        onClick={() => void handleSendSample(dest.chatId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                      >
                        <Send className="w-3 h-3" aria-hidden="true" />
                        <span>Test</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDestinations((prev) =>
                            prev.filter((d) => d.id !== dest.id)
                          )
                        }
                        aria-label={`Remove ${dest.label}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. Trigger Rules */}
          <section className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                3. Real-Time Alert Triggers
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Choose which confirmed live events automatically push a Telegram
                message. Historical candles synced before streaming starts are
                ignored to prevent duplicate alerts.
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {triggerDefinitions.map((item) => (
                <label
                  key={item.key}
                  className="py-3 flex items-start justify-between gap-4 cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.description}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={triggers[item.key]}
                    onChange={(e) =>
                      setTriggers((prev) => ({
                        ...prev,
                        [item.key]: e.target.checked,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 shrink-0"
                  />
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Live Message Preview + Delivery Log */}
        <div className="space-y-6">
          {/* Preview & Sample Dispatch */}
          <section className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Message Preview &amp; Test
              </h2>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
                {(
                  [
                    { id: 'BIAS_CONFIRMED', label: 'Bias' },
                    { id: 'ENTRY_CONFIRMED', label: 'Entry' },
                    { id: 'TARGET_HIT', label: 'Target' },
                    { id: 'SL_HIT', label: 'SL Hit' },
                  ] as { id: PreviewEventTab; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPreviewEvent(tab.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      previewEvent === tab.id
                        ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clean Telegram Message Bubble Preview */}
            <div className="bg-[#0B0F17] border border-slate-800 text-slate-100 rounded-xl p-4 space-y-1.5 font-mono text-xs leading-relaxed">
              {previewLines.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.bold
                      ? 'font-sans font-bold text-white text-sm pb-0.5'
                      : 'text-slate-300'
                  }
                >
                  {line.text}
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={telegram.testing || destinations.length === 0}
              onClick={() => void handleSendSample()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-45 rounded-lg transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {telegram.testing
                  ? 'Sending Sample Alert...'
                  : `Send Sample ${eventLabel(previewEvent)} Alert to Enabled Chats`}
              </span>
            </button>
          </section>

          {/* Delivery Log */}
          <section className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Recent Delivery Log
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {telegram.recentDeliveries.length} sent
              </span>
            </div>

            {telegram.recentDeliveries.length === 0 ? (
              <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg py-8 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                No Telegram alerts dispatched in this session yet. Send a sample
                alert above or start your Fyers live stream.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg max-h-[380px] overflow-y-auto">
                {telegram.recentDeliveries.map((log) => (
                  <div key={log.id} className="p-3.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {eventLabel(log.eventType)}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                        {log.timestamp}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400">
                      {log.symbol} · Delivered {log.deliveredCount}/
                      {log.totalTargets}
                    </div>
                    {log.results.some((r) => !r.ok) && (
                      <div className="space-y-1 pt-1">
                        {log.results
                          .filter((r) => !r.ok)
                          .map((r) => (
                            <div
                              key={r.chatId}
                              className="text-[11px] text-red-600 dark:text-red-400 font-mono"
                            >
                              {r.label}: {r.error}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
