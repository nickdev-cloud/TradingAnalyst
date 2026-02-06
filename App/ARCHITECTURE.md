# Architecture

This document explains the architecture of the TradingAnalyst codebase for new engineers.

---

## High-Level Overview

This is a **paper-trading POC** that scans configurable assets on a schedule, runs a multi-indicator strategy (200 MA + Bravo 9 + RSI + MACD) with OpenAI-based confluence analysis, flags trade candidates, and can execute paper trades via Alpaca. It is a two-tier local app: a Node.js/Express backend and a React/Vite frontend, connected via a REST API.

```
TradingAnalyst/
  roadmap.md              <- Full project plan & progress reference
  App/
    README.md
    ARCHITECTURE.md       <- This file
    Backend/              <- Node.js + Express REST API
    Frontend/             <- React + Vite admin panel
```

---

## Backend (`App/Backend/src/`)

**Stack:** Node.js (ESM), Express, SQLite (better-sqlite3), Alpaca SDK, OpenAI SDK, node-cron.

### Entry point

`src/index.js` boots Express, initializes the database, starts the scheduler, and mounts four route groups under `/api`.

### Layer breakdown

| Layer | Files | Responsibility |
|-------|-------|----------------|
| **Routes** | `routes/settings.js`, `routes/scan.js`, `routes/trades.js`, `routes/assets.js` | REST endpoints -- thin controllers that call into services/config |
| **Services** | `services/alpaca.js`, `services/openai.js`, `services/strategy.js`, `services/scan.js`, `services/scheduler.js` | All business logic lives here |
| **Config** | `config/settings.js` | Read/write settings from SQLite with defaults & validation |
| **DB** | `db/init.js` | SQLite schema init (tables: `settings`, `trades`, `candidates`); trades cleared on startup (session-only) |

### Key services

1. **`alpaca.js`** -- Wraps all Alpaca API calls. `getBars()` routes to stocks (Data API v2) or crypto (v1beta3) based on symbol. `placeStockOrder()` supports bracket orders with SL/TP. Also handles asset search (cached 24h) and 429 retry logic.

2. **`strategy.js`** -- Pure computation, no side effects. Exports functions for each indicator:
   - `computeMA` / `computeEMA` -- Simple & exponential moving averages
   - `computeTrendFrom200` -- Price vs 200 MA = bullish/bearish trend
   - `computeBravo9` -- EMA9/EMA20/SMA180 alignment for reversal signals
   - `computeRSI` -- Relative Strength Index (oversold/overbought)
   - `computeMACD` -- MACD line, signal line, histogram
   - `computeIndicators` -- Computes all of the above in one call
   - `isWorthSendingToOpenAI` -- Pre-qualification gate (strong Bravo 9, or trend+RSI/MACD confluence)

3. **`openai.js`** -- Builds a structured prompt with a trading summary + raw indicators + last 30 OHLCV bars. Sends to OpenAI (one isolated session per symbol+timeframe). Parses the JSON response for recommendation, confidence, momentum prediction, SL/TP, and reasoning. Has 429 retry with backoff.

4. **`scan.js`** -- The core orchestrator. `runScan()` iterates over every (asset, timeframe) pair: fetches bars from Alpaca, computes indicators, optionally sends to OpenAI, and stores candidates in SQLite. Supports an `indicatorOnly` mode that skips OpenAI. Exposes scan progress for the UI to poll.

5. **`scheduler.js`** -- Uses `node-cron` to trigger `runScan()` at a configurable cron interval, but only when the Alpaca market clock says the market is open.

### REST API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/settings` | Read current settings |
| PUT | `/api/settings` | Update settings (assets, timeframes, cron, strategy params, OpenAI config) |
| GET | `/api/settings/openai-models` | Proxy to OpenAI `/v1/models` for model dropdown |
| POST | `/api/scan/run` | Trigger a scan (full or indicator-only) |
| GET | `/api/scan/progress` | Poll scan progress |
| GET | `/api/scan/candidates` | Get latest candidates |
| POST | `/api/scan/execute` | Execute a trade on Alpaca (stock-only, with TP validation) |
| GET | `/api/trades` | List trades (filterable) |
| GET | `/api/trades/stats` | Win/loss stats |
| POST | `/api/trades` | Log a trade manually |
| PATCH | `/api/trades/:id` | Update trade (exit info) |
| GET | `/api/assets/search?q=` | Search Alpaca assets by symbol/name |
| GET | `/api/health` | Health check |

### Data model (SQLite)

- **`settings`** -- Key-value store for all configuration.
- **`candidates`** -- Scan results: symbol, timeframe, side, confidence, SL/TP, RSI, Bravo 9, 200 MA trend, MACD, momentum prediction, raw OpenAI response.
- **`trades`** -- Executed trades: symbol, side, qty, entry/exit price+time, SL/TP, PnL, Alpaca order ID, timeframe. Cleared on every backend restart (session-only by design).

---

## Frontend (`App/Frontend/src/`)

**Stack:** React 18, React Router, Vite. No state management library -- just `useState`/`useCallback`/`useMemo`. No component library -- all custom styling via `index.css`.

### Structure

- **`App.jsx`** -- Router with 3 routes: `/` (Dashboard), `/settings`, `/trades`.
- **`api/client.js`** -- Thin fetch wrapper for every backend endpoint. All calls go to `/api/*` which Vite proxies to `localhost:3001`.
- **Pages:**
  - **`Dashboard.jsx`** -- Main page. "Run scan now" and "Scan without OpenAI" buttons. Shows candidates table (with execute modal) and an indicators-only table (sortable, filterable, with confluence highlighting).
  - **`Settings.jsx`** -- Form for assets, timeframes, cron, strategy params, OpenAI model dropdown + system prompt.
  - **`Trades.jsx`** -- Trade history table + stats (win rate, total PnL, avg win/loss).
- **Components:**
  - `Layout.jsx` -- Nav bar wrapper.
  - `ExecuteModal.jsx` -- Modal for executing a trade from a candidate (entry price, qty, SL/TP, order type, with validation).
- **Utils:**
  - `tradingView.js` -- Helper to generate TradingView chart URLs for symbols.

### Dev proxy

The Vite dev server on `:5173` proxies `/api` requests to the backend on `:3001` (configured in `vite.config.js`).

---

## Data Flow (scan cycle)

```
User clicks "Run scan now" (or cron fires)
  -> POST /api/scan/run
    -> scan.js: for each (asset, timeframe):
        1. alpaca.js: getBars() -> OHLCV data
        2. strategy.js: computeIndicators() -> 200 MA, RSI, MACD, Bravo 9
        3. strategy.js: isWorthSendingToOpenAI() -> pre-qualification gate
        4. openai.js: getRecommendation() -> long/short/none + confidence + SL/TP
        5. Insert candidate into SQLite
    -> Return candidates to frontend
  -> Dashboard renders candidates table
  -> User clicks "Execute" on a candidate
    -> POST /api/scan/execute
      -> alpaca.js: placeStockOrder() (bracket with SL/TP)
      -> Insert trade into SQLite
```

---

## Key design decisions

- **Session-only trades**: The `trades` table is wiped on every backend restart. This is intentional for a POC.
- **Pre-qualification gate**: Not every asset gets sent to OpenAI. `isWorthSendingToOpenAI()` checks for strong Bravo 9 reversal or 200 MA + RSI/MACD confluence first, saving API costs.
- **Crypto data, stock execution**: Crypto symbols (e.g. ETH/USD) are supported for data/scanning but not for trade execution.
- **Rate limit handling**: Both Alpaca and OpenAI calls have retry-with-backoff for 429s, plus a configurable delay between Alpaca data calls.
- **No auth**: The admin panel is local-only with no authentication (POC scope).
