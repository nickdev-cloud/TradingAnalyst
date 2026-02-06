# Efficiency Report — TradingAnalyst Codebase

This report identifies several places in the codebase where performance or resource usage
could be improved.

---

## 1. Redundant EMA computation in `computeMACD` (Backend — strategy.js)

**File:** `App/Backend/src/services/strategy.js`, lines 42-69

`computeMACD` calls `computeEMA(bars, fast)` and `computeEMA(bars, slow)` to get the
final EMA values, each iterating through all bars. Immediately after, it rebuilds the
fast and slow EMA series from scratch in a second loop to produce the MACD value array.
The final values from `computeEMA` are redundant since the loop already yields them.

**Impact:** Two full extra passes over the bars array on every MACD calculation
(called once per asset-timeframe pair during each scan).

**Fix applied in this PR:** Removed the redundant `computeEMA` calls and derived
`macdLine` directly from the loop that already computes both EMA series.

---

## 2. Multiple array passes in `/trades/stats` (Backend — routes/trades.js)

**File:** `App/Backend/src/routes/trades.js`, lines 22-43

The stats endpoint fetches all trades with P&L, then performs six separate iterations:
`filter` for wins, `filter` for losses, `reduce` for total P&L, `filter + reduce` for
average win, and `filter + reduce` for average loss. This could be done in a single pass.

**Impact:** 6x iteration overhead on every stats request. Low impact at small trade
counts, but wasteful as trade history grows.

---

## 3. Redundant EMA9 in `computeBravo9` (Backend — strategy.js)

**File:** `App/Backend/src/services/strategy.js`, lines 113-138

`computeBravo9` calls `computeEMA(bars, 9)` for the final EMA9 value, then calls
`computeBarsSinceEma9Cross`, which internally calls `computeEMA9Series` and recomputes
the full EMA9 series from scratch. The final EMA9 value is computed twice.

**Impact:** One extra full pass per Bravo 9 calculation per asset-timeframe pair.

---

## 4. Duplicate 200 MA computation in `computeIndicators` (Backend — strategy.js)

**File:** `App/Backend/src/services/strategy.js`, lines 184-205

When `maPeriods` includes 200 (the default), `computeMA(bars, 200)` runs once in the
MA loop and again inside `computeTrendFrom200`. The 200-period simple moving average is
computed twice.

**Impact:** One redundant O(200) sum per asset-timeframe pair.

---

## 5. Redundant `startsWith` inside `searchAssets` (Backend — alpaca.js)

**File:** `App/Backend/src/services/alpaca.js`, lines 269-274

The filter checks `symbol.startsWith(query)` OR `symbol.includes(query)`. The
`startsWith` condition is logically redundant because `includes` already matches any
string that starts with the query.

**Impact:** Negligible runtime cost but adds unnecessary code complexity.

---

## 6. Repeated ALTER TABLE with silent catch in `initDb` (Backend — db/init.js)

**File:** `App/Backend/src/db/init.js`, lines 64-87

Each column migration is a separate `ALTER TABLE` wrapped in try/catch, relying on
exceptions for control flow. A `PRAGMA table_info(candidates)` check could determine
which columns already exist and only add missing ones, avoiding exception overhead on
every startup.

**Impact:** Minor — only runs once at startup, but is a code-quality concern.
