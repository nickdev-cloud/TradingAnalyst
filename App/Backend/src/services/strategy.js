/**
 * Indicators: 200 MA trend, MAs, RSI, MACD, Bravo 9 (reversal). No box theory.
 */

/**
 * @param {Array<{c}>} bars - bars with close
 * @param {number} period - MA period
 * @returns {number | null} - MA value at last bar
 */
export function computeMA(bars, period) {
  if (!bars || bars.length < period) return null;
  const slice = bars.slice(-period);
  const sum = slice.reduce((s, b) => s + b.c, 0);
  return sum / period;
}

/**
 * Exponential moving average.
 * @param {Array<{c}>} bars - bars with close
 * @param {number} period - EMA period
 * @returns {number | null} - EMA value at last bar
 */
export function computeEMA(bars, period) {
  if (!bars || bars.length < period) return null;
  const k = 2 / (period + 1);
  let ema = bars.slice(0, period).reduce((s, b) => s + b.c, 0) / period;
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].c * k + ema * (1 - k);
  }
  return ema;
}

/**
 * MACD: fast EMA - slow EMA, signal line = EMA(MACD, 9), histogram = MACD - signal.
 * Momentum: bullish when histogram > 0, bearish when histogram < 0.
 * @param {Array<{c}>} bars - bars with close
 * @param {number} fast - fast EMA period (default 12)
 * @param {number} slow - slow EMA period (default 26)
 * @param {number} signalPeriod - signal line EMA period (default 9)
 * @returns {{ macdLine, signalLine, histogram, signal: 'bullish'|'bearish' } | null}
 */
export function computeMACD(bars, fast = 12, slow = 26, signalPeriod = 9) {
  if (!bars || bars.length < slow + signalPeriod) return null;
  const closes = bars.map((b) => b.c);
  const kFast = 2 / (fast + 1);
  const kSlow = 2 / (slow + 1);
  const macdValues = [];
  let emaF = closes.slice(0, fast).reduce((s, c) => s + c, 0) / fast;
  let emaS = closes.slice(0, slow).reduce((s, c) => s + c, 0) / slow;
  for (let i = slow; i < closes.length; i++) {
    emaF = closes[i] * kFast + emaF * (1 - kFast);
    emaS = closes[i] * kSlow + emaS * (1 - kSlow);
    macdValues.push(emaF - emaS);
  }
  if (macdValues.length < signalPeriod) return null;
  const macdLine = emaF - emaS;
  const kSig = 2 / (signalPeriod + 1);
  let signalLine = macdValues.slice(0, signalPeriod).reduce((s, v) => s + v, 0) / signalPeriod;
  for (let i = signalPeriod; i < macdValues.length; i++) {
    signalLine = macdValues[i] * kSig + signalLine * (1 - kSig);
  }
  const histogram = macdLine - signalLine;
  const signal = histogram > 0 ? 'bullish' : 'bearish';
  return { macdLine, signalLine, histogram, signal };
}

/**
 * EMA9 series from bar 0..bars.length-1 (values before period are null).
 * @param {Array<{c}>} bars
 * @returns {Array<number|null>} ema9At[i] = EMA9 through bar i, or null if i < 8
 */
function computeEMA9Series(bars) {
  if (!bars || bars.length < 9) return [];
  const k = 2 / 10;
  const out = Array(bars.length).fill(null);
  let ema = bars.slice(0, 9).reduce((s, b) => s + b.c, 0) / 9;
  out[8] = ema;
  for (let i = 9; i < bars.length; i++) {
    ema = bars[i].c * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/**
 * Bars since close last crossed EMA9 (above-to-below or below-to-above). 0 = just crossed this bar.
 * @param {Array<{c}>} bars
 * @returns {number | null} bars since last cross, or null if not enough data / no cross found
 */
export function computeBarsSinceEma9Cross(bars) {
  if (!bars || bars.length < 10) return null;
  const ema9Series = computeEMA9Series(bars);
  let lastCrossBarIndex = null;
  for (let i = 9; i < bars.length; i++) {
    const prevDiff = bars[i - 1].c - ema9Series[i - 1];
    const currDiff = bars[i].c - ema9Series[i];
    if (prevDiff !== 0 && currDiff !== 0 && (prevDiff > 0) !== (currDiff > 0)) {
      lastCrossBarIndex = i;
    }
  }
  if (lastCrossBarIndex == null) return null;
  return bars.length - 1 - lastCrossBarIndex;
}

/**
 * Bravo 9 indicator: EMA 9, EMA 20, SMA 180 alignment (reversal focus).
 * Strong bullish/bearish = stacked alignment; used for reversal potential.
 */
export function computeBravo9(bars) {
  if (!bars || bars.length < 180) return null;
  const ema9 = computeEMA(bars, 9);
  const ema20 = computeEMA(bars, 20);
  const sma180 = computeMA(bars, 180);
  if (ema9 == null || ema20 == null || sma180 == null) return null;
  const close = bars[bars.length - 1].c;
  const aboveEma9 = close > ema9;
  const strongBullish = aboveEma9 && ema9 > ema20 && ema20 > sma180;
  const strongBearish = !aboveEma9 && ema9 < ema20 && ema20 < sma180;
  let signal = aboveEma9 ? 'bullish' : 'bearish';
  if (strongBullish) signal = 'strong_bullish';
  if (strongBearish) signal = 'strong_bearish';
  const barsSinceEma9Cross = computeBarsSinceEma9Cross(bars);
  return {
    ema9,
    ema20,
    sma180,
    close,
    aboveEma9,
    signal,
    strongBullish,
    strongBearish,
    barsSinceEma9Cross,
  };
}

/**
 * Overall trend from 200 MA: price above = bullish, below = bearish (how to trade direction).
 */
export function computeTrendFrom200(bars) {
  const ma200 = computeMA(bars, 200);
  if (!bars || bars.length < 200 || ma200 == null) return null;
  const close = bars[bars.length - 1].c;
  return {
    ma200,
    close,
    above: close > ma200,
    trend: close > ma200 ? 'bullish' : 'bearish',
  };
}

/**
 * @param {Array<{c}>} bars - bars with close
 * @param {number} period - RSI period (e.g. 14)
 * @returns {{ rsi: number, oversold: boolean, overbought: boolean } | null}
 */
export function computeRSI(bars, period = 14) {
  if (!bars || bars.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const change = bars[i].c - bars[i - 1].c;
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return { rsi: 100, oversold: false, overbought: true };
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return {
    rsi,
    oversold: rsi < 30,
    overbought: rsi > 70,
  };
}

/**
 * Build indicators: 200 MA trend, MAs, RSI, MACD, Bravo 9. No box.
 */
export function computeIndicators(bars, strategy) {
  if (!bars || bars.length === 0) return null;
  const mas = {};
  for (const p of strategy.maPeriods || [20, 50, 200]) {
    const val = computeMA(bars, p);
    if (val != null) mas[`ma${p}`] = val;
  }
  const trend200 = computeTrendFrom200(bars);
  const rsiResult = computeRSI(bars, strategy.rsiPeriod ?? 14);
  const macd = computeMACD(bars, 12, 26, 9);
  const bravo9 = computeBravo9(bars);
  const last = bars[bars.length - 1];
  return {
    mas,
    trend200,
    rsi: rsiResult,
    macd,
    bravo9,
    currentPrice: last.c,
    lastBar: last,
  };
}

/**
 * Pre-qualification: is this setup worth sending to OpenAI for analysis?
 * Returns true if at least one of: (1) Bravo 9 strong reversal, (2) 200 MA trend + RSI or MACD confluence.
 * @param {object} indicators - result of computeIndicators
 * @returns {boolean}
 */
export function isWorthSendingToOpenAI(indicators) {
  if (!indicators) return false;
  const bravo9 = indicators.bravo9;
  const trend200 = indicators.trend200;
  const rsi = indicators.rsi;
  const macd = indicators.macd;

  if (bravo9 && (bravo9.signal === 'strong_bullish' || bravo9.signal === 'strong_bearish')) {
    return true;
  }

  if (!trend200) return false;

  const rsiAdds = rsi && (rsi.oversold || rsi.overbought);
  const macdAligned = macd && trend200 && trend200.trend === macd.signal;
  if (rsiAdds || macdAligned) return true;

  return false;
}
