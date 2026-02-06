import { Router } from 'express';
import { getSettings, getLastScannedAt } from '../config/settings.js';
import { runScan, getScanProgress } from '../services/scan.js';
import { placeStockOrder } from '../services/alpaca.js';
import { getDb } from '../db/init.js';

export const scanRouter = Router();

scanRouter.get('/progress', (req, res) => {
  try {
    res.json(getScanProgress());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

scanRouter.post('/run', async (req, res) => {
  try {
    const settings = getSettings();
    const indicatorOnly = req.query.indicatorOnly === 'true' || req.body?.indicatorOnly === true;
    const result = await runScan(settings, { indicatorOnly });
    if (indicatorOnly) {
      return res.json({ indicatorsOnly: result.indicatorsOnly, scannedAt: result.scannedAt });
    }
    res.json({ candidates: result.candidates, scannedAt: result.scannedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

scanRouter.get('/candidates', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM candidates ORDER BY scanned_at DESC LIMIT 50').all();
    const lastScannedAt = getLastScannedAt() ?? null;
    res.json({ candidates: rows, lastScannedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const CRYPTO_SYMBOLS = new Set(['BTC', 'ETH', 'BTCUSD', 'ETHUSD', 'BTC/USD', 'ETH/USD', 'DOGE', 'LTC', 'XRP', 'ADA', 'SOL', 'AVAX', 'LINK', 'UNI', 'MATIC', 'DOT', 'ATOM', 'ETC', 'XLM', 'ALGO', 'FIL', 'APT', 'ARB', 'OP', 'INJ', 'SUI', 'SEI', 'NEAR', 'AAVE', 'CRV', 'MKR', 'SNX', 'COMP', 'SAND', 'MANA', 'APE', 'LDO', 'RPL', 'PEPE', 'SHIB', 'WLD']);

function isCrypto(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  const s = symbol.toUpperCase().replace('/', '');
  return CRYPTO_SYMBOLS.has(s) || CRYPTO_SYMBOLS.has(symbol.toUpperCase());
}

scanRouter.post('/execute', async (req, res) => {
  try {
    const { symbol, side, quantity, stopLoss, takeProfit, orderType = 'market', limitPrice, timeframe } = req.body;
    if (!symbol || !side || !quantity) {
      return res.status(400).json({ error: 'symbol, side, and quantity are required' });
    }
    if (orderType === 'limit' && (limitPrice == null || limitPrice === '')) {
      return res.status(400).json({ error: 'limitPrice is required when order type is limit' });
    }
    if (isCrypto(symbol)) {
      return res.status(400).json({ error: `${symbol} is a crypto symbol. This app executes stock orders only (e.g. AAPL, SPY, MSFT). Crypto is not supported for execution here.` });
    }
    const sideNorm = String(side).toLowerCase();
    const takeProfitNum = takeProfit != null && takeProfit !== '' ? Number(takeProfit) : null;
    const limitPriceNum = orderType === 'limit' && limitPrice != null && limitPrice !== '' ? Number(limitPrice) : null;
    if (takeProfitNum != null && limitPriceNum != null) {
      const minGap = 0.01;
      if (sideNorm === 'short') {
        if (takeProfitNum > limitPriceNum - minGap) {
          return res.status(400).json({
            error: 'For a short, take profit must be below your entry (limit) price so you buy back cheaper. Alpaca requires take profit ≤ entry − 0.01.',
            details: { entry: limitPriceNum, takeProfit: takeProfitNum, maxTakeProfit: limitPriceNum - minGap },
          });
        }
      } else if (sideNorm === 'long') {
        if (takeProfitNum < limitPriceNum + minGap) {
          return res.status(400).json({
            error: 'For a long, take profit must be above your entry (limit) price so you sell higher. Alpaca requires take profit ≥ entry + 0.01.',
            details: { entry: limitPriceNum, takeProfit: takeProfitNum, minTakeProfit: limitPriceNum + minGap },
          });
        }
      }
    }
    const order = await placeStockOrder({
      symbol,
      side,
      quantity: Number(quantity),
      orderType: orderType === 'limit' ? 'limit' : 'market',
      limitPrice: orderType === 'limit' ? Number(limitPrice) : undefined,
      stopPrice: stopLoss ? Number(stopLoss) : undefined,
      takeProfitPrice: takeProfit ? Number(takeProfit) : undefined,
    });
    const db = getDb();
    const entryPrice = order.filled_avg_price ?? order.filled_average_price ?? order.limit_price ?? null;
    db.prepare(
      'INSERT INTO trades (symbol, side, quantity, entry_price, entry_time, stop_loss, take_profit, alpaca_order_id, timeframe) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      symbol,
      side,
      Number(quantity),
      entryPrice,
      order.filled_at ?? order.submitted_at ?? new Date().toISOString(),
      stopLoss ? Number(stopLoss) : null,
      takeProfit ? Number(takeProfit) : null,
      order.id,
      timeframe ?? null
    );
    const trade = db.prepare('SELECT * FROM trades ORDER BY id DESC LIMIT 1').get();
    res.status(201).json({ order, trade });
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    let message = body?.message ?? (typeof body === 'string' ? body : null) ?? err.message;
    if (status === 422 && typeof message === 'string' && message.includes('take_profit')) {
      message = 'Take profit price is invalid for this side. For a short, take profit must be below entry (you buy back cheaper). For a long, take profit must be above entry (you sell higher). Adjust or clear take profit and try again.';
    }
    const payload = { error: message };
    if (body && typeof body === 'object' && Object.keys(body).length > 1) payload.details = body;
    res.status(status && status >= 400 && status < 600 ? status : 500).json(payload);
  }
});
