# Trading Strategy Application – Development Plan & Roadmap

This plan defines the application: stack, workflows, action steps, and future enhancements. Use this as the project reference.

---

## 1. Application Summary

- **Goal**: POC trading bot that scans a configurable list of assets on a schedule, runs a **200 MA trend + Bravo 9 reversal + RSI + MACD** strategy with OpenAI-based confluence analysis and momentum prediction, flags candidates, recommends position size and SL/TP, and can execute paper trades via Alpaca. All config and trade history managed via a local admin panel.
- **Scope**: Paper trading only initially; design allows future autonomous live trading.
- **Location**: Application code lives under `app/` with `app/frontend` (React admin UI) and `app/backend` (Node.js API + strategy + scheduling).

---

## 2. Application Stack

| Layer           | Technology                   | Notes                                                                                                                                                                                                                                                                                                                         |
| --------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**    | React (Vite or CRA)          | Admin panel: settings, asset list, timeframes, strategy params, trade log, stats. Runs locally (e.g. localhost:5173).                                                                                                                                                                                                             |
| **Backend**     | Node.js (Express or Fastify) | REST API for admin CRUD, scheduler, strategy runner, OpenAI integration, trade logging.                                                                                                                                                                                                                                       |
| **Data source** | Alpaca API                   | Bars and execution. Use either: (A) **Alpaca MCP server** via MCP client in Node (spawn `uvx alpaca-mcp-server serve`, call tools over stdio), or (B) **Alpaca Node SDK / REST** from backend (simpler, no subprocess). Recommend (B) for robustness; (A) if you want the app to "pair with" the same MCP server Cursor uses. |
| **Analysis**    | OpenAI API                   | Prompts with OHLCV + computed indicators; model acts as "professional trader" for entry/exit and position sizing.                                                                                                                                                                                                                 |
| **Persistence** | SQLite or JSON/file          | Settings (assets, timeframes, frequency, strategy params), trade log (entry/exit, SL/TP, PnL), and optional cache of last bar fetch.                                                                                                                                                                                          |
| **Scheduler**   | node-cron or bull/bullmq     | Run "scan + analyze" at configured frequency (e.g. every 15 min during market hours).                                                                                                                                                                                                                                         |

**Key dependencies (backend)**: `@alpacahq/alpaca-trade-api` or MCP client (`@modelcontextprotocol/sdk`), `openai`, `node-cron` (or similar), SQLite driver or lowdb. **Frontend**: React, React Query or SWR, simple table/chart library for trade history and stats.

---

## 3. Alpaca MCP Server Integration (Reference)

The existing `alpaca-mcp-server` exposes tools your app logic can replicate or call:

- **Market data**: `get_stock_bars(symbol, days, hours, minutes, timeframe, limit, start, end, ...)` — timeframes: `1Min`, `5Min`, `15Min`, `1Hour`, `1Day`, `1Week`, `1Month`.
- **Trading**: `place_stock_order(symbol, side, quantity, type, time_in_force, order_class, limit_price, stop_price, ...)` — supports `order_class`: `bracket` for SL/TP.
- **Account/orders**: `get_account_info`, `get_orders`, `get_all_positions`, etc.

If the backend uses the **Alpaca Node SDK** instead of MCP, same operations are available via the official SDK; paper trading is controlled by base URL (paper vs live).

---

## 4. Data & Configuration Model

- **Settings (file or DB)**
  - **Assets**: list of tickers (e.g. `["AAPL","MSFT","SPY"]`).
  - **Timeframes**: e.g. `["1Day","1Hour"]` for bar data.
  - **Scan frequency**: cron expression or interval (e.g. every 15 minutes, only when market is open).
  - **Strategy parameters**:
    - **200 MA**: overall trend (price above = bullish, below = bearish).
    - **Bravo 9**: reversal potential (EMA 9, EMA 20, SMA 180 alignment).
    - **RSI** and **MACD**: momentum (overbought/oversold, MACD bullish/bearish).
    - MA periods (e.g. 20, 50, 200).
    - Optional: min/max position size, risk per trade.
  - **OpenAI**: model name, API key (env), system prompt; model returns momentum prediction + recommendation.
- **Trade log (DB or file)**
  - Per trade: symbol, side, quantity, entry price/time, stop_loss, take_profit, exit price/time, exit reason (SL/TP/manual), PnL, timeframe/strategy version.
  - Optionally: Alpaca order IDs for reconciliation.

---

## 5. Core Workflows

### 5.1 Scan and Analyze (scheduled)

- **Input**: Settings (assets, timeframes, strategy params).
- **Steps**:
  1. For each (asset, timeframe): fetch bars via Alpaca (MCP or SDK).
  2. Compute: 200 MA trend, Bravo 9, RSI, MACD, MAs.
  3. Build prompt with bars + indicators (200 MA, Bravo 9, RSI, MACD); call OpenAI.
  4. Parse model output: momentum prediction; recommendation (long/short/none) based on confluence; suggested size, SL, TP.
  5. Store "candidates" or signals for the day (optional) and return to admin or next step.

### 5.2 Execute Trade (manual or later autonomous)

- **Input**: Selected candidate + user-confirmed or auto-approved size, SL, TP.
- **Steps**:
  1. Call Alpaca `place_stock_order` with `order_class: bracket`, `stop_price`, `limit_price` (for TP if applicable), or two orders (entry + SL/TP).
  2. Persist trade in trade log (entry, SL, TP, order IDs).
  3. (Later) Optional: listen for fills or poll orders/positions to update trade log (exit price, PnL).

### 5.3 Trade Logging and Win/Loss

- On order fill or on close: update trade record with exit price, exit reason, PnL.
- Backend exposes: list of trades, filters (symbol, date range), and **stats**: win rate, total PnL, average win/loss, count.
- Admin panel: table of trades + summary stats (win/loss %, total PnL, etc.).

---

## 6. Strategy Logic (200 MA + Bravo 9 + RSI + MACD)

- **Box theory**: Removed. No longer used.
- **200 MA trend** ✅ Implemented
  - Price above 200 MA = bullish (favor longs); below = bearish (favor shorts). Determines overall trend / how to trade.
- **Moving averages** ✅ Implemented
  - Compute MA (e.g. 20, 50, 200); 200 MA used for trend; configurable in settings.
- **Bravo 9** ✅ Implemented
  - EMA 9, EMA 20, SMA 180; signal: strong_bullish / bullish / bearish / strong_bearish. Primary **reversal** signal for entry potential.
- **RSI** ✅ Implemented
  - Oversold (&lt; 30) / overbought (&gt; 70); momentum strength/weakness.
- **MACD** ✅ Implemented
  - 12/26/9; histogram and signal (bullish/bearish); momentum confirmation.
- **OpenAI prompt** ✅ Implemented
  - One isolated session per (symbol, timeframe). Trading summary: 200 MA trend, Bravo 9, RSI, MACD, MAs. Model gives a **momentum prediction** and recommends long/short only on strong confluence; otherwise "none". Output: recommendation, confidence, momentumPrediction, position size, stop loss, take profit, reasoning.

Strategy parameters (timeframes, MA periods, RSI thresholds) are **editable via admin panel** and stored in settings.

---

## 7. Admin Panel (Local)

  - **Settings** ✅
  - Asset list (stocks and crypto e.g. ETH/USD).
  - Timeframes to pull (e.g. 1Day, 1Hour).
  - Scan frequency (cron expression).
  - Strategy: MA periods, RSI settings.
  - OpenAI model (dropdown from API) and system prompt override.
- **Dashboard / scan results**
  - Last run time; list of current "candidates" (symbol, timeframe, side, strength, suggested SL/TP).
  - Button: "Run scan now".
- **Trade execution (manual POC)**
  - From a candidate: prefill size, SL, TP; user confirms and sends order.
  - Backend calls Alpaca (MCP or SDK) and logs trade.
- **Trade history & stats**
  - Table: symbol, side, entry/exit, SL/TP, PnL, exit reason.
  - Summary: win rate, total PnL, number of wins/losses, average win/loss.
  - Optional: simple charts (equity curve, win/loss by symbol).

All served from the same backend; frontend runs locally (e.g. React on localhost).

---

## 8. File and Folder Structure (Target)

```
Zihuatanejo/
  roadmap.md                    <- This plan (project reference)
  alpaca-mcp-server/            <- Existing MCP server (unchanged)
  app/
    backend/
      package.json
      src/
        config/                 <- Load/save settings
        routes/                 <- REST: settings, trades, candidates, run-scan
        services/
          alpaca.js             <- Alpaca SDK or MCP client wrapper
          openai.js             <- OpenAI client + prompt builder
          strategy.js            <- 200 MA trend, MA, RSI, MACD, Bravo 9
          scheduler.js           <- Cron-based scan trigger
        db/                     <- SQLite init and path
        index.js
      .env.example              <- ALPACA_*, OPENAI_API_KEY
    frontend/
      package.json
      src/
        components/             <- Settings form, TradeTable, Stats, CandidateList
        pages/                  <- Dashboard, Settings, Trades
        api/                    <- Fetch backend
        App.jsx, main.jsx
    README.md                   <- How to run backend + frontend
```

---

## 9. Action Steps (Phased)

**Phase 1 – Foundation** ✅ Done
1. ✅ Create `app/backend` (Node + Express), `app/frontend` (React + Vite).
2. ✅ Implement settings model and persistence (SQLite under `app/backend`).
3. ✅ Integrate Alpaca: Node SDK + Data API v2 for **stocks** bars; v1beta3 **crypto** bars for symbols like ETH/USD. `getBars(symbol, timeframe, ...)` routes to stocks or crypto by symbol. Latest-trade price via `getLatestTradePrice(symbol)` for consistent entry price.
4. ✅ Add `.env` and `.env.example` for Alpaca keys, OpenAI API key, paper/live flag.

**Phase 2 – Strategy & Analysis** ✅ Done
5. ✅ Strategy module: **200 MA trend**, MAs, RSI, **MACD**, **Bravo 9** (reversal). No box theory.
6. ✅ OpenAI service: prompt with 200 MA trend, Bravo 9, RSI, MACD, MAs; **momentum prediction**; **separate session per (symbol, timeframe)**; model recommends long/short only on strong confluence, else "none".
7. ✅ Scan endpoint: fetch bars → indicators → OpenAI → candidates. **Scan without OpenAI** option returns indicator-only results (200 MA, RSI, MACD, Bravo 9) in a separate table.
8. ✅ Candidates stored in DB; Dashboard shows only candidates with recommendation (long/short). Trades table cleared on backend startup (session-only).

**Phase 3 – Scheduling & Execution** ✅ Done
9. ✅ Scheduler (node-cron) at configured frequency.
10. ✅ `placeStockOrder` (SDK) with bracket SL/TP; execute endpoint; **take-profit validation** (short: TP ≤ entry − 0.01; long: TP ≥ entry + 0.01).
11. ✅ Trade logging with timeframe; entry price from order or limit.

**Phase 4 – Admin Panel** ✅ Done
12. ✅ Settings: assets (including crypto symbols e.g. ETH/USD), timeframes, frequency, strategy params, **OpenAI model dropdown** (from GET `/api/settings/openai-models` → OpenAI `/v1/models`), system prompt.
13. ✅ Dashboard: "Run scan now" and "Scan without OpenAI"; candidates table (Symbol, Timeframe, Side, Confidence, RSI, Bravo 9, 200 MA, MACD, Entry, SL/TP, Momentum, Analysis); **highlight executed** rows; Execute modal with entry price and TP validation.
14. ✅ Trades page: table and stats (win rate, total PnL, counts).
15. ✅ Execute from UI; refresh trade list.

**Phase 5 – Polish** ✅ Done
16. ✅ Validate inputs (tickers, timeframes); asset regex allows `A-Z0-9./` for ETH/USD.
17. ✅ Error handling (Alpaca/OpenAI); optional debug logging for OpenAI request/response.
18. ✅ README: run instructions, env vars, data & pricing notes, paper trading default.

**Resolved issues (implementation)**  
- Alpaca 403 “recent SIP data”: bar end time set to 1 hour in the past for free-tier.  
- Alpaca 422 order invalid: TP validation (short TP ≤ entry − 0.01, long TP ≥ entry + 0.01); clear UI validation in Execute modal.  
- Alpaca 404 crypto bars: request uses `symbols` query parameter for v1beta3 crypto.  
- OpenAI 429 quota: retry with backoff in OpenAI service; 1.5s delay between per-symbol OpenAI calls in scan.  
- OpenAI unsupported `temperature`: removed from API call for compatibility.  
- Export fix: `getLatestTradePrice` exported from `alpaca.js`.

---

## 9b. Progress Summary (current)

| Area | Status | Notes |
|------|--------|--------|
| Backend (Node + Express) | ✅ | SQLite, Alpaca stocks + crypto bars, latest-trade price |
| Strategy | ✅ | 200 MA trend, MA, RSI, MACD, Bravo 9 (reversal); momentum prediction |
| OpenAI | ✅ | Isolated session per (symbol, TF); trading summary; model dropdown from API |
| Scan | ✅ | Full scan + "Scan without OpenAI" (indicators: 200 MA, RSI, MACD, Bravo 9) |
| Execute | ✅ | Limit/market; bracket SL/TP; short/long TP validation |
| Dashboard | ✅ | Candidates table, executed highlight, Execute modal |
| Settings | ✅ | Assets, timeframes, cron, strategy, OpenAI model list, prompt |
| Trades | ✅ | Session-only (cleared on start), stats |
| Crypto data | ✅ | ETH/USD etc. for **scan/data**; execution remains stock-only |

**Current limitations / next (optional)**  
- **Scan without OpenAI**: Results appear in a separate indicators-only table; could optionally populate candidates with `side='none'`.  
- **Crypto current price**: `getLatestTradePrice` is stock-only; crypto uses last bar close (Alpaca crypto trades API could be added for consistency).  
- **Crypto execution**: Intentionally stock-only; crypto order API could be added later.

---

## 10. Security & Credentials

- Alpaca API keys and OpenAI API key: **environment variables only** (e.g. `.env` in `app/backend`), never in repo or frontend.
- Admin panel: local-only; no auth required for POC. (Later: optional basic auth or run behind VPN if ever exposed.)

---

## 11. Potential Future Enhancements

- **Autonomous mode**: Auto-execute when signal strength and strategy rules exceed a threshold (with optional daily loss limit).
- **Live trading**: Toggle to live Alpaca base URL; extra confirmations or "live" flag in UI.
- **Crypto execution**: Allow execution for crypto pairs (Alpaca crypto order API) if desired.
- **More indicators**: MACD, volume profile, or other inputs to the OpenAI prompt.
- **Backtesting**: Replay historical bars through the same strategy + OpenAI (or rule-only) and record hypothetical trades for win rate and PnL.
- **Alerts**: Notifications (e.g. email, Discord) when a candidate appears or when a trade closes.
- **Multi-account**: Support multiple Alpaca accounts (e.g. paper vs live) via profile selection in settings.
- **Persistent trade history**: Optional setting to keep trades across restarts instead of session-only.
