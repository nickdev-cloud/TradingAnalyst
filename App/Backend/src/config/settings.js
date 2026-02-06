import { getDb } from '../db/init.js';

const DEFAULTS = {
  assets: ['AAPL', 'MSFT', 'SPY'],
  timeframes: ['1Day', '1Hour'],
  schedulerEnabled: true,
  scanFrequencyCron: '*/15 * * * *',
  strategy: {
    maPeriods: [20, 50, 200],
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
  },
  openai: {
    model: 'gpt-4o-mini',
    logResponsesToConsole: true,
    systemPrompt: `You are a professional trader. You receive a TRADING SUMMARY (Symbol, Timeframe, Entry, 200 MA trend, RSI, MACD, Bravo 9, moving averages), full indicators, and OHLCV bars from Alpaca. Strategy: (1) 200 MA = overall trend (above = bullish/favor longs, below = bearish/favor shorts). (2) Bravo 9 = reversal potential (strong_bullish/strong_bearish = strong entry signal). (3) RSI and MACD = momentum (oversold/overbought, MACD bullish/bearish). Recommend "long" or "short" only when there is strong confluence across these signals; otherwise "none". Always provide a brief momentumPrediction (potential momentum movement). Output only valid JSON: recommendation, confidence, momentumPrediction, positionSizeSuggestion, stopLoss, takeProfit, reasoning.`,
  },
};

function get(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function set(key, value) {
  const db = getDb();
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, serialized);
  return get(key);
}

export function getLastScannedAt() {
  const v = get('lastScannedAt');
  return typeof v === 'string' ? v : undefined;
}

export function setLastScannedAt(isoString) {
  set('lastScannedAt', isoString);
}

export function getSettings() {
  const assets = get('assets');
  const timeframes = get('timeframes');
  const schedulerEnabledRaw = get('schedulerEnabled');
  const scanFrequencyCron = get('scanFrequencyCron');
  const strategyRaw = get('strategy');
  const openai = get('openai');
  const strategy = { ...DEFAULTS.strategy, ...strategyRaw };
  if (strategy.maPeriods != null && !Array.isArray(strategy.maPeriods)) {
    strategy.maPeriods = Array.isArray(strategyRaw.maPeriods) ? strategyRaw.maPeriods : DEFAULTS.strategy.maPeriods;
  }
  if (!Array.isArray(strategy.maPeriods) || strategy.maPeriods.length === 0) {
    strategy.maPeriods = DEFAULTS.strategy.maPeriods;
  }
  const schedulerEnabled = schedulerEnabledRaw === true || (schedulerEnabledRaw !== false && schedulerEnabledRaw !== 'false');
  return {
    assets: assets ?? DEFAULTS.assets,
    timeframes: timeframes ?? DEFAULTS.timeframes,
    schedulerEnabled,
    scanFrequencyCron: scanFrequencyCron ?? DEFAULTS.scanFrequencyCron,
    strategy,
    openai: openai ?? DEFAULTS.openai,
  };
}

const VALID_TIMEFRAMES = ['1Min', '5Min', '15Min', '30Min', '1Hour', '2Hour', '4Hour', '6Hour', '1Day', '1Week', '1Month'];

const TIMEFRAME_ALIASES = {
  '1min': '1Min', '5min': '5Min', '15min': '15Min', '30min': '30Min',
  '1hour': '1Hour', '2hour': '2Hour', '4hour': '4Hour', '6hour': '6Hour',
  '1day': '1Day', '1d': '1Day', '1week': '1Week', '1w': '1Week',
  '1month': '1Month', '1m': '1Month',
};

function normalizeTimeframe(input) {
  const s = String(input).trim();
  if (!s) return null;
  if (VALID_TIMEFRAMES.includes(s)) return s;
  const key = s.toLowerCase();
  return TIMEFRAME_ALIASES[key] || null;
}

export function updateSettings(partial) {
  const keys = ['assets', 'timeframes', 'schedulerEnabled', 'scanFrequencyCron', 'strategy', 'openai'];
  for (const key of keys) {
    if (partial[key] !== undefined) {
      if (key === 'schedulerEnabled') {
        set(key, partial.schedulerEnabled === true);
      } else if (key === 'assets') {
        const arr = Array.isArray(partial.assets) ? partial.assets : [];
        const cleaned = arr.map((t) => String(t).trim().toUpperCase()).filter((t) => /^[A-Z0-9./]{1,20}$/.test(t));
        set(key, cleaned);
      } else if (key === 'timeframes') {
        const arr = Array.isArray(partial.timeframes) ? partial.timeframes : [];
        const cleaned = arr
          .map((t) => normalizeTimeframe(t))
          .filter(Boolean);
        const unique = [...new Set(cleaned)];
        set(key, unique.length ? unique : DEFAULTS.timeframes);
      } else if (key === 'strategy') {
        const existing = get('strategy') ?? {};
        const merged = { ...DEFAULTS.strategy, ...existing, ...partial.strategy };
        if (merged.maPeriods != null && !Array.isArray(merged.maPeriods)) {
          merged.maPeriods = DEFAULTS.strategy.maPeriods;
        }
        if (!Array.isArray(merged.maPeriods) || merged.maPeriods.length === 0) {
          merged.maPeriods = DEFAULTS.strategy.maPeriods;
        }
        set(key, merged);
      } else {
        set(key, partial[key]);
      }
    }
  }
  return getSettings();
}
