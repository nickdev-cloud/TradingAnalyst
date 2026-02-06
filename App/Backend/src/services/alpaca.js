import Alpaca from '@alpacahq/alpaca-trade-api';

const DATA_BASE = 'https://data.alpaca.markets';
const TRADE_BASE_PAPER = 'https://paper-api.alpaca.markets';
const TRADE_BASE_LIVE = 'https://api.alpaca.markets';

let tradingClient = null;

function getTradingClient() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const paper = process.env.ALPACA_PAPER !== 'false';
  if (!key || !secret) {
    throw new Error('ALPACA_API_KEY and ALPACA_SECRET_KEY must be set');
  }
  if (!tradingClient) {
    tradingClient = new Alpaca({
      keyId: key,
      secretKey: secret,
      paper,
    });
  }
  return tradingClient;
}

function getDataUrl() {
  return DATA_BASE;
}

function getTradeBaseUrl() {
  const paper = process.env.ALPACA_PAPER !== 'false';
  return paper ? TRADE_BASE_PAPER : TRADE_BASE_LIVE;
}

function getAuthHeaders() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with retry on 429. Waits for Retry-After seconds or 65s, then retries up to maxRetries.
 * @param {string} url
 * @param {{ headers: object }} init
 * @param {{ maxRetries?: number }} opts
 * @returns {Promise<Response>}
 */
async function fetchWithRetry429(url, init, opts = {}) {
  const maxRetries = opts.maxRetries ?? 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt === maxRetries) return res;
    const retryAfter = parseInt(res.headers.get('Retry-After'), 10);
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 65000;
    console.warn(`Alpaca 429: waiting ${waitMs / 1000}s before retry (${attempt + 1}/${maxRetries})`);
    await sleep(waitMs);
  }
  return fetch(url, init);
}

/** True if symbol is a crypto pair (e.g. ETH/USD, BTC/USD). */
function isCrypto(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  const s = symbol.toUpperCase().trim();
  return s.includes('/') || s === 'BTCUSD' || s === 'ETHUSD';
}

/**
 * Fetch the latest trade price for a symbol (matches Alpaca UI "current price" / last).
 * GET /v2/stocks/{symbol}/trades/latest. Returns null if unavailable (e.g. 403 on free tier).
 * @param {string} symbol - Ticker (e.g. AAPL)
 * @returns {Promise<number | null>}
 */
export async function getLatestTradePrice(symbol) {
  const url = `${getDataUrl()}/v2/stocks/${symbol}/trades/latest`;
  const res = await fetchWithRetry429(url, { headers: getAuthHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  const p = data.trade?.p;
  return typeof p === 'number' ? p : null;
}

/**
 * Fetch OHLCV bars for a crypto pair via Alpaca v1beta3 crypto API.
 * @param {string} symbol - e.g. ETH/USD, BTC/USD
 * @param {string} timeframe - 1Min, 5Min, 15Min, 30Min, 1Hour, 4Hour, 1Day, 1Week
 * @param {object} opts - { days, limit }
 * @returns {Promise<Array<{t, o, h, l, c, v}>>}
 */
async function getCryptoBars(symbol, timeframe, opts = {}) {
  const { days = 30, limit = 500 } = opts;
  const now = new Date();
  const end = new Date(now.getTime() - 60 * 60 * 1000);
  const start = new Date();
  start.setDate(start.getDate() - Math.max(1, days));
  const startStr = start.toISOString().slice(0, 19) + 'Z';
  const endStr = end.toISOString().slice(0, 19) + 'Z';
  const params = new URLSearchParams({
    symbols: symbol,
    start: startStr,
    end: endStr,
    timeframe,
    limit: String(limit),
  });
  const url = `${getDataUrl()}/v1beta3/crypto/us/bars?${params.toString()}`;
  const res = await fetchWithRetry429(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca data error: ${res.status} ${text}`);
  }
  const data = await res.json();
  const barsBySymbol = data.bars || {};
  const bars = Array.isArray(barsBySymbol) ? barsBySymbol : barsBySymbol[symbol] || [];
  return bars.map((b) => ({
    t: b.t,
    o: b.o,
    h: b.h,
    l: b.l,
    c: b.c,
    v: b.v,
  }));
}

/**
 * Fetch OHLCV bars for a symbol (stocks or crypto) and timeframe.
 * Stocks: Alpaca Data API v2. Crypto: v1beta3 crypto API.
 * @param {string} symbol - Ticker (e.g. AAPL or ETH/USD)
 * @param {string} timeframe - 1Min, 5Min, 15Min, 1Hour, 1Day, etc.
 * @param {object} opts - { days, limit }
 * @returns {Promise<Array<{t, o, h, l, c, v}>>}
 */
export async function getBars(symbol, timeframe, opts = {}) {
  if (isCrypto(symbol)) {
    return getCryptoBars(symbol, timeframe, opts);
  }
  const { days = 30, limit = 500 } = opts;
  const now = new Date();
  const end = new Date(now.getTime() - 60 * 60 * 1000);
  const start = new Date();
  start.setDate(start.getDate() - Math.max(1, days));
  const startStr = start.toISOString().slice(0, 19) + 'Z';
  const endStr = end.toISOString().slice(0, 19) + 'Z';
  const url = `${getDataUrl()}/v2/stocks/${symbol}/bars?timeframe=${encodeURIComponent(timeframe)}&start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}&limit=${limit}`;
  const res = await fetchWithRetry429(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca data error: ${res.status} ${text}`);
  }
  const data = await res.json();
  const bars = data.bars || [];
  return bars.map((b) => ({
    t: b.t,
    o: b.o,
    h: b.h,
    l: b.l,
    c: b.c,
    v: b.v,
  }));
}

/**
 * Place a stock order, optionally with bracket (SL/TP).
 * @param {object} params - { symbol, side, quantity, orderType, limitPrice, stopPrice, takeProfitPrice }
 */
export async function placeStockOrder(params) {
  const {
    symbol,
    side,
    quantity,
    orderType = 'market',
    limitPrice,
    stopPrice,
    takeProfitPrice,
  } = params;
  const client = getTradingClient();
  const qty = Math.floor(quantity);
  if (qty <= 0) throw new Error('Quantity must be positive');

  const sideNorm = String(side).toLowerCase();
  const alpacaSide = sideNorm === 'long' ? 'buy' : sideNorm === 'short' ? 'sell' : sideNorm;

  const orderParams = {
    symbol,
    qty,
    side: alpacaSide,
    type: orderType,
    time_in_force: 'day',
  };
  if (limitPrice != null) orderParams.limit_price = String(limitPrice);

  const useBracket = stopPrice || takeProfitPrice;
  if (useBracket) {
    orderParams.order_class = 'bracket';
    if (stopPrice) orderParams.stop_loss = { stop_price: String(stopPrice) };
    if (takeProfitPrice) orderParams.take_profit = { limit_price: String(takeProfitPrice) };
  } else if (stopPrice && orderType !== 'limit') {
    orderParams.stop_price = String(stopPrice);
  }

  const order = await client.createOrder(orderParams);
  return order;
}

export async function getClock() {
  const client = getTradingClient();
  return client.getClock();
}

const ASSETS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let assetsCache = null;
let assetsCacheTime = 0;

/**
 * Fetch all active assets from Alpaca (us_equity and crypto). Cached in memory for ASSETS_CACHE_TTL_MS.
 * @returns {Promise<Array<{ symbol: string, name: string, asset_class: string }>>}
 */
async function fetchAllAssets() {
  const base = getTradeBaseUrl();
  const headers = getAuthHeaders();
  const results = [];
  for (const assetClass of ['us_equity', 'crypto']) {
    const url = `${base}/v2/assets?asset_class=${assetClass}&status=active`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Alpaca assets error (${assetClass}): ${res.status} ${text}`);
    }
    const list = await res.json();
    for (const a of list || []) {
      const symbol = a.symbol;
      const name = a.name || '';
      if (symbol) results.push({ symbol, name, asset_class: a.asset_class || assetClass });
    }
  }
  return results;
}

/**
 * Get full asset list, using cache if valid.
 */
async function getCachedAssets() {
  const now = Date.now();
  if (assetsCache && now - assetsCacheTime < ASSETS_CACHE_TTL_MS) {
    return assetsCache;
  }
  const list = await fetchAllAssets();
  assetsCache = list;
  assetsCacheTime = now;
  return list;
}

const SEARCH_LIMIT = 25;

/**
 * Search assets by symbol or name. Uses cached Alpaca asset list; filters by q (case-insensitive).
 * @param {string} q - Search query (e.g. "aapl" or "apple")
 * @returns {Promise<Array<{ symbol: string, name: string, asset_class?: string }>>}
 */
export async function searchAssets(q) {
  const query = (q || '').trim();
  if (!query) return [];
  const all = await getCachedAssets();
  const lower = query.toLowerCase();
  const matches = all.filter(
    (a) =>
      a.symbol.toLowerCase().startsWith(lower) ||
      a.symbol.toLowerCase().includes(lower) ||
      (a.name && a.name.toLowerCase().includes(lower))
  );
  return matches.slice(0, SEARCH_LIMIT).map((a) => ({ symbol: a.symbol, name: a.name || '', asset_class: a.asset_class }));
}
