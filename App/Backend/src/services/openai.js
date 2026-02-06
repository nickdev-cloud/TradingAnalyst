import OpenAI from 'openai';

let client = null;

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY must be set');
  if (!client) client = new OpenAI({ apiKey: key });
  return client;
}

/**
 * Trading summary for the model: 200 MA trend, Bravo 9 reversal, RSI/MACD momentum. No box.
 */
function buildTradingSummary(symbol, timeframe, indicators, currentPriceOverride) {
  const ind = indicators || {};
  const entryPrice = currentPriceOverride ?? ind.currentPrice ?? null;
  const trend200 = ind.trend200 || null;
  const rsi = ind.rsi;
  const macd = ind.macd;
  const bravo9 = ind.bravo9;
  const mas = ind.mas || {};
  return {
    symbol,
    timeframe,
    entry: entryPrice != null ? Number(entryPrice) : null,
    trend200: trend200 != null ? { trend: trend200.trend, above: trend200.above, ma200: trend200.ma200 } : null,
    rsi: rsi != null ? { value: rsi.rsi, oversold: rsi.oversold, overbought: rsi.overbought } : null,
    macd: macd != null ? { signal: macd.signal, histogram: macd.histogram, macdLine: macd.macdLine, signalLine: macd.signalLine } : null,
    bravo9: bravo9
      ? { signal: bravo9.signal, ema9: bravo9.ema9, ema20: bravo9.ema20, sma180: bravo9.sma180, strongBullish: bravo9.strongBullish, strongBearish: bravo9.strongBearish }
      : null,
    movingAverages: Object.keys(mas).length ? mas : null,
  };
}

/**
 * Build user message: new strategy (Bravo 9 reversal, 200 MA trend, RSI/MACD momentum) and ask for momentum prediction + recommendation.
 */
export function buildAnalysisPrompt(bars, indicators, symbol, timeframe, currentPriceOverride = null) {
  const lastBars = bars.slice(-30).map((b) => ({
    t: typeof b.t === 'string' ? b.t : new Date(b.t).toISOString(),
    o: b.o,
    h: b.h,
    l: b.l,
    c: b.c,
    v: b.v,
  }));
  const summary = buildTradingSummary(symbol, timeframe, indicators, currentPriceOverride);
  return {
    role: 'user',
    content: `This is a single-asset, single-timeframe session. Evaluate ONLY the symbol and timeframe below. Do not consider any other symbols or timeframes.

--- TRADING SUMMARY (key data for your judgment) ---
${JSON.stringify(summary, null, 2)}

--- FULL INDICATORS (raw) ---
${JSON.stringify(indicators, null, 2)}

--- RECENT OHLCV BARS (last 30) ---
${JSON.stringify(lastBars, null, 0)}

--- STRATEGY CONTEXT ---
We use confluence across these signals to find high-probability setups:
1. **200 MA** – Overall trend: price above 200 MA = bullish (favor longs), below = bearish (favor shorts). This tells you which direction to trade.
2. **Bravo 9** – Reversal potential: strong_bullish / strong_bearish alignment (EMA9, EMA20, SMA180) indicates strong reversal setups. This is the primary signal for potential entries.
3. **RSI** – Momentum: oversold (< 30) or overbought (> 70) shows weakening/strengthening momentum and can confirm or caution the trade.
4. **MACD** – Momentum: bullish (histogram > 0) or bearish (histogram < 0) confirms direction and strength of momentum.

Strong confluence = 200 MA trend + Bravo 9 reversal signal + RSI and MACD aligning with the direction = best call-to-action.

--- INSTRUCTIONS ---
Using the trading summary and bar data from Alpaca for this asset and timeframe:
1. Note the **200 MA trend** (bullish = above, bearish = below) to know how to trade (long vs short bias).
2. Assess **Bravo 9** for reversal potential (strong_bullish / strong_bearish = strong entry signal).
3. Use **RSI** and **MACD** to gauge momentum strength (oversold/overbought, MACD signal) and whether it supports or contradicts the setup.
4. Give a **simple prediction of potential momentum movement** (e.g. "expect short-term upside into resistance" or "momentum weakening, possible pullback") based on confluence.
5. Recommend "long" or "short" ONLY when there is strong confluence across these signals in that direction; otherwise recommend "none" and explain what you are waiting for.
6. If you recommend long/short, provide stopLoss, takeProfit (price levels), confidence (0-1), and optional positionSizeSuggestion.

Respond with a single JSON object only: { "recommendation": "long"|"short"|"none", "confidence": 0-1, "momentumPrediction": "string (brief prediction of potential momentum movement)", "positionSizeSuggestion": number|null, "stopLoss": number|null, "takeProfit": number|null, "reasoning": "string" }. No other text.`,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getRecommendation(bars, indicators, symbol, timeframe, openaiConfig, currentPriceOverride = null) {
  const openai = getClient();
  const model = openaiConfig?.model || 'gpt-4o-mini';
  const systemPrompt = openaiConfig?.systemPrompt || 'You are a professional trader. Output only valid JSON.';
  const logToConsole = openaiConfig?.logResponsesToConsole !== false;
  const userMsg = buildAnalysisPrompt(bars, indicators, symbol, timeframe, currentPriceOverride);
  const messages = [{ role: 'system', content: systemPrompt }, userMsg];

  if (logToConsole) {
    console.log('\n---------- [OpenAI] Request ----------');
    console.log(`Ticker: ${symbol}  Timeframe: ${timeframe}  Model: ${model}`);
    console.log('--- User prompt (data sent) ---');
    console.log(userMsg.content.slice(0, 1500) + (userMsg.content.length > 1500 ? '...' : ''));
    console.log('---------------------------------------\n');
  }

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages,
      });
      const content = completion.choices?.[0]?.message?.content?.trim() || '{}';
      let parsed;
      try {
        const jsonStr = content.replace(/```json?\s*/g, '').replace(/```\s*$/g, '').trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        parsed = { recommendation: 'none', confidence: 0, reasoning: content };
      }
      const result = {
        recommendation: parsed.recommendation || 'none',
        confidence: Number(parsed.confidence) || 0,
        momentumPrediction: parsed.momentumPrediction ?? null,
        positionSizeSuggestion: parsed.positionSizeSuggestion ?? null,
        stopLoss: parsed.stopLoss ?? null,
        takeProfit: parsed.takeProfit ?? null,
        reasoning: parsed.reasoning || '',
      };
      if (logToConsole) {
        console.log('---------- [OpenAI] Response ----------');
        console.log(`Ticker: ${symbol}  Timeframe: ${timeframe}`);
        console.log('--- Parsed ---');
        console.log(JSON.stringify(result, null, 2));
        console.log('---------------------------------------\n');
      }
      return result;
    } catch (err) {
      lastErr = err;
      const is429 = err?.status === 429 || err?.code === 'rate_limit_exceeded';
      if (is429 && attempt < 2) {
        const waitMs = (attempt + 1) * 3000;
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
