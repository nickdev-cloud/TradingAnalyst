import { getBars, getLatestTradePrice } from './alpaca.js';
import { getSettings, setLastScannedAt } from '../config/settings.js';
import { computeIndicators, isWorthSendingToOpenAI } from './strategy.js';
import { getRecommendation } from './openai.js';
import { getDb } from '../db/init.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Delay (ms) between each Alpaca data API call to avoid 429. Override with ALPACA_DATA_DELAY_MS env. */
const ALPACA_DELAY_MS = Number(process.env.ALPACA_DATA_DELAY_MS) || 500;

/** In-memory scan progress for UI polling. */
const scanProgress = {
  running: false,
  indicatorOnly: false,
  current: 0,
  total: 0,
  symbol: null,
  timeframe: null,
};

export function getScanProgress() {
  return { ...scanProgress };
}

/**
 * @param {object} settings
 * @param {object} opts - { indicatorOnly: boolean } - if true, skip OpenAI and return indicators + bar counts (for testing when over quota)
 */
export async function runScan(settings, opts = {}) {
  const { assets, timeframes, strategy, openai: openaiConfig } = settings;
  const { indicatorOnly = false } = opts;
  const candidates = [];
  const db = getDb();
  const indicatorsOnly = [];

  const assetList = assets || [];
  const tfList = timeframes || [];
  const totalSteps = assetList.length * tfList.length;

  scanProgress.running = true;
  scanProgress.indicatorOnly = indicatorOnly;
  scanProgress.total = totalSteps;
  scanProgress.current = 0;
  scanProgress.symbol = null;
  scanProgress.timeframe = null;

  if (!indicatorOnly) {
    db.prepare('DELETE FROM candidates').run();
  }

  for (let symbolIndex = 0; symbolIndex < assetList.length; symbolIndex++) {
    const symbol = assetList[symbolIndex];
    let latestPrice = null;
    try {
      latestPrice = await getLatestTradePrice(symbol);
      await sleep(ALPACA_DELAY_MS);
    } catch (_) {}
    for (let tfIndex = 0; tfIndex < tfList.length; tfIndex++) {
      const timeframe = tfList[tfIndex];
      scanProgress.current = symbolIndex * tfList.length + tfIndex;
      scanProgress.symbol = symbol;
      scanProgress.timeframe = timeframe;

      try {
        const bars = await getBars(symbol, timeframe, { days: 60, limit: 300 });
        await sleep(ALPACA_DELAY_MS);
        if (!bars || bars.length < 2) continue;
        const indicators = computeIndicators(bars, strategy);
        if (!indicators) continue;
        const currentPrice = latestPrice ?? indicators?.currentPrice ?? (bars.length ? bars[bars.length - 1].c : null);
        const trend200 = indicators?.trend200 ?? null;
        const trend200Signal = trend200?.trend ?? null;
        const macd = indicators?.macd ?? null;
        const macdSignal = macd?.signal ?? null;
        if (indicatorOnly) {
          indicatorsOnly.push({ symbol, timeframe, barCount: bars.length, indicators });
          continue;
        }
        if (!isWorthSendingToOpenAI(indicators)) continue;
        await sleep(1500);
        const rec = await getRecommendation(bars, indicators, symbol, timeframe, openaiConfig, currentPrice);
        if (rec.recommendation === 'none') continue;
        const rsiVal = indicators?.rsi?.rsi ?? null;
        const bravo9 = indicators?.bravo9 ?? null;
        const bravo9Signal = bravo9?.signal ?? null;
        const bravo9Json = bravo9 ? JSON.stringify(bravo9) : null;
        const candidate = {
          symbol,
          timeframe,
          side: rec.recommendation,
          confidence: rec.confidence,
          suggested_size: rec.positionSizeSuggestion,
          stop_loss: rec.stopLoss,
          take_profit: rec.takeProfit,
          raw_response: rec.reasoning,
          current_price: currentPrice,
          rsi: rsiVal,
          bravo9_signal: bravo9Signal,
          bravo9: bravo9Json,
          trend_signal: trend200Signal,
          trend_200: trend200Signal,
          macd_signal: macdSignal,
          momentum_prediction: rec.momentumPrediction ?? null,
        };
        candidates.push(candidate);
        db.prepare(
          `INSERT INTO candidates (symbol, timeframe, side, confidence, suggested_size, stop_loss, take_profit, raw_response, rsi, bravo9_signal, bravo9, current_price, trend_signal, trend_200, macd_signal, momentum_prediction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          candidate.symbol,
          candidate.timeframe,
          candidate.side,
          candidate.confidence,
          candidate.suggested_size,
          candidate.stop_loss,
          candidate.take_profit,
          candidate.raw_response,
          candidate.rsi,
          candidate.bravo9_signal,
          candidate.bravo9,
          candidate.current_price,
          candidate.trend_signal,
          candidate.trend_200,
          candidate.macd_signal,
          candidate.momentum_prediction
        );
      } catch (err) {
        console.error(`Scan error ${symbol} ${timeframe}:`, err.message);
      }
    }
  }

  scanProgress.running = false;
  scanProgress.current = totalSteps;
  scanProgress.symbol = null;
  scanProgress.timeframe = null;

  const scannedAt = new Date().toISOString();
  setLastScannedAt(scannedAt);
  return indicatorOnly ? { indicatorsOnly, scannedAt } : { candidates, scannedAt };
}
