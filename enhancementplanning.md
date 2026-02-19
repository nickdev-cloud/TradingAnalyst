# TradingAnalyst - Enhancement Planning

> **Created:** February 2026
> **Based on:** Full codebase review of Backend (Node.js/Express/SQLite) and Frontend (React/Vite)

This document outlines potential features and improvements that could be considered for the TradingAnalyst application. Enhancements are grouped by category and ranked by estimated impact.

---

## 1. Data & Analytics Enhancements

### 1.1 Backtesting Engine

**Impact:** High | **Effort:** High

The application currently only evaluates live/current data. A backtesting module would replay historical bars through the existing strategy pipeline (200 MA + Bravo 9 + RSI + MACD) and record hypothetical trades to measure win rate and P&L before risking real capital.

- New backend service `services/backtest.js` that accepts a date range, symbol list, and strategy params
- Reuse `computeIndicators` and optionally `getRecommendation` (or a rule-only mode to avoid OpenAI costs)
- Store backtest results in a new `backtest_runs` table with per-trade detail rows
- Frontend page with date range picker, equity curve chart, and per-trade drill-down
- Compare multiple strategy parameter sets side-by-side

### 1.2 Persistent Trade History (Cross-Session)

**Impact:** High | **Effort:** Low

Trades are currently cleared on every backend startup (`db/init.js` line 83). Adding a settings toggle to preserve trade history across sessions would enable long-term performance tracking.

- Add `persistTradeHistory` boolean to the settings model
- Conditionally skip `DELETE FROM trades` at startup when enabled
- Add a manual "Clear trade history" button on the Trades page
- Add date-range filtering to the trades list and stats endpoint

### 1.3 Equity Curve & Performance Charts

**Impact:** Medium | **Effort:** Medium

The Trades page currently shows only a stats summary grid and a flat table. Adding visual charts would make performance analysis much more intuitive.

- Cumulative P&L (equity curve) line chart over time
- Win/loss distribution bar chart by symbol
- Profit factor and Sharpe ratio calculations in the stats endpoint
- Use a lightweight library like Recharts or Chart.js (neither is currently in the project)

### 1.4 Volume Analysis

**Impact:** Medium | **Effort:** Low

Bar data already includes volume (`v` field) but it is not used in any indicator or displayed in the UI. Volume confirms price moves and can improve signal quality.

- Add volume-weighted indicators (e.g., VWAP, On-Balance Volume) to `strategy.js`
- Display volume in the indicators table on the Dashboard
- Include volume data in the OpenAI prompt for better confluence analysis
- Add volume spike detection as a pre-qualification signal in `isWorthSendingToOpenAI`

### 1.5 Multi-Timeframe Confluence

**Impact:** Medium | **Effort:** Medium

Scans currently evaluate each (symbol, timeframe) pair independently. A multi-timeframe confluence view would show whether signals align across timeframes for the same symbol, which is a stronger confirmation.

- After scanning, group results by symbol and compare signals across timeframes
- Add a "Confluence Summary" section on the Dashboard that highlights symbols where multiple timeframes agree
- Weight the OpenAI recommendation higher when lower and higher timeframes align

---

## 2. Trading & Execution Enhancements

### 2.1 Crypto Order Execution

**Impact:** High | **Effort:** Medium

Crypto symbols (e.g., ETH/USD) are supported for scanning and data but execution is intentionally stock-only. Enabling crypto execution would complete the feature set.

- Add `placeCryptoOrder` function in `alpaca.js` using Alpaca's crypto order API
- Update the `isCrypto` guard in `routes/scan.js` to route to the correct order function instead of rejecting
- Add a settings toggle for enabling/disabling crypto execution
- Handle fractional quantity for crypto (currently `Math.floor` in `placeStockOrder`)

### 2.2 Autonomous Trading Mode

**Impact:** High | **Effort:** High

Currently all trades require manual confirmation via the Execute modal. An autonomous mode would auto-execute when signal strength exceeds a configurable threshold.

- New settings: `autoExecute` (boolean), `minConfidence` threshold, `maxDailyLoss` limit, `maxOpenPositions`
- After scan, automatically place orders for candidates that meet the criteria
- Daily loss tracking — halt auto-execution if cumulative daily loss hits the limit
- Activity log visible on the Dashboard showing autonomous decisions and reasons
- Safety: require explicit opt-in and show a prominent warning banner when active

### 2.3 Position Monitoring & Auto-Close

**Impact:** Medium | **Effort:** Medium

After placing a trade, the app does not track whether the order was filled or monitor open positions. Adding position monitoring would close the loop.

- Poll Alpaca `getPositions` and `getOrders` on an interval to update trade records
- Auto-populate `exit_price`, `exit_time`, `exit_reason`, and `pnl` when a bracket order fills
- Show open positions with live P&L on the Dashboard
- Optional trailing stop-loss adjustment based on price movement

### 2.4 Risk Management Dashboard

**Impact:** Medium | **Effort:** Medium

There is no visibility into overall portfolio risk. A dedicated risk view would help with position sizing and exposure control.

- Display current account balance and buying power (from Alpaca `getAccount`)
- Show total exposure, per-symbol exposure, and sector concentration
- Max drawdown calculation from trade history
- Risk-per-trade calculator based on account size and stop-loss distance
- Kelly criterion or fixed-percentage position sizing suggestions

---

## 3. AI & Strategy Enhancements

### 3.1 Strategy Comparison Mode

**Impact:** High | **Effort:** Medium

Allow users to run scans with different strategy parameters or different OpenAI models and compare results side-by-side.

- "Save as preset" for strategy configurations
- Run scan against multiple presets and show results in parallel columns
- Track which preset generated each candidate for performance attribution
- A/B test different OpenAI system prompts to see which produces better recommendations

### 3.2 Sentiment & News Integration

**Impact:** Medium | **Effort:** Medium

The AI analysis currently only sees technical indicators. Adding market sentiment or news context could improve recommendation quality.

- Integrate a news API (e.g., Alpaca News API, Finnhub, or NewsAPI) to fetch recent headlines per symbol
- Include top headlines in the OpenAI prompt alongside technical data
- Add a "News" tab or section on the Dashboard showing relevant headlines for scanned symbols
- Sentiment score as an additional indicator column

### 3.3 Custom Indicator Support

**Impact:** Medium | **Effort:** High

The strategy is currently fixed to 200 MA + Bravo 9 + RSI + MACD. Allowing users to define custom indicator combinations would make the tool more flexible.

- Define an indicator plugin interface (name, compute function, signal interpretation)
- Settings UI for enabling/disabling individual indicators and adjusting their parameters
- Dynamic OpenAI prompt construction based on which indicators are active
- Preset indicator bundles (e.g., "Momentum," "Mean Reversion," "Trend Following")

### 3.4 AI Model Response Caching

**Impact:** Low | **Effort:** Low

Each scan makes fresh OpenAI calls even if the same symbol/timeframe was recently analyzed with similar data. Caching recent AI responses would reduce costs and speed up re-scans.

- Cache OpenAI responses in a `ai_cache` table keyed by symbol + timeframe + data hash
- Configurable TTL (e.g., 15 minutes) before re-querying
- "Force refresh" option on the scan to bypass cache
- Display whether a result came from cache or a fresh API call

---

## 4. Notification & Alert Enhancements

### 4.1 Real-Time Alerts (Email / Discord / SMS)

**Impact:** High | **Effort:** Medium

Users currently must watch the Dashboard to see new candidates. Push notifications would allow passive monitoring.

- Settings section for configuring alert channels (email via SMTP/SendGrid, Discord webhook, SMS via Twilio)
- Trigger alerts when: a new high-confidence candidate appears, a trade fills, a stop-loss is hit, or the daily loss limit is approached
- Configurable alert thresholds (e.g., only alert when confidence > 0.7)
- Alert history log to avoid duplicate notifications

### 4.2 WebSocket / SSE for Live Updates

**Impact:** Medium | **Effort:** Medium

The frontend currently polls `/api/scan/progress` every 500ms. Switching to WebSocket or Server-Sent Events would be more efficient and enable real-time candidate streaming.

- Replace polling with SSE for scan progress updates
- Push new candidates to the UI as they are discovered during a scan (instead of waiting for the full scan to complete)
- Live price ticker for watched assets on the Dashboard
- Connection status indicator in the sidebar

---

## 5. UI / UX Enhancements

### 5.1 Dashboard Watchlist & Favorites

**Impact:** Medium | **Effort:** Low

Allow users to pin favorite symbols to the top of the Dashboard for quick access, independent of the full asset list in Settings.

- "Star" button next to each symbol in scan results
- Persistent watchlist stored in the settings table
- Watchlist section at the top of the Dashboard with last-known price and signal summary
- Quick-scan individual watchlist items without running the full scan

### 5.2 Embedded TradingView Charts

**Impact:** Medium | **Effort:** Low

Symbols currently link out to TradingView in a new tab. Embedding a TradingView widget directly in the app would keep users in context.

- Use TradingView's free Advanced Chart widget (iframe embed)
- Show inline chart when clicking a symbol row on the Dashboard
- Overlay indicator levels (200 MA, EMA9, SL/TP) on the embedded chart
- Expand/collapse chart panel

### 5.3 Dark / Light Theme Toggle

**Impact:** Low | **Effort:** Low

The app is dark-theme only. Adding a light theme option would improve accessibility and user preference support.

- Define a `[data-theme="light"]` set of CSS variables in `index.css`
- Toggle switch in the sidebar or Settings page
- Persist preference in localStorage
- Respect `prefers-color-scheme` media query as default

### 5.4 Mobile-Responsive Layout

**Impact:** Low | **Effort:** Medium

The sidebar layout does not collapse on small screens. A responsive design would make the app usable on mobile devices.

- Collapsible sidebar with hamburger menu on screens below 768px
- Stack the settings grid to single-column (partially done at 900px)
- Touch-friendly table scrolling and tap targets
- Bottom navigation bar on mobile as an alternative to the sidebar

### 5.5 Toast Notifications

**Impact:** Low | **Effort:** Low

Errors are shown as inline alert banners. Adding a toast notification system would provide non-intrusive feedback for success actions (e.g., "Settings saved," "Trade placed," "Scan complete").

- Lightweight toast component with auto-dismiss
- Success, warning, and error variants
- Stack multiple toasts without blocking UI interaction

---

## 6. Infrastructure & Reliability Enhancements

### 6.1 Authentication & Multi-User Support

**Impact:** High | **Effort:** High

The app has no authentication — it is designed for local single-user access. Adding auth would be necessary before any deployment beyond localhost.

- Basic auth (username/password) or OAuth (e.g., GitHub login) middleware
- Per-user settings, assets, and trade history
- Session management with JWT or cookie-based sessions
- Role-based access if supporting multiple users (e.g., admin vs. viewer)

### 6.2 Database Migration System

**Impact:** Medium | **Effort:** Low

Schema changes are currently handled by try/catch `ALTER TABLE` statements in `db/init.js`. A proper migration system would be more maintainable.

- Numbered migration files (e.g., `migrations/001_add_bravo9_columns.sql`)
- Migration runner that tracks applied migrations in a `migrations` table
- Rollback support for safe iteration
- Run migrations automatically on startup

### 6.3 API Rate Limiting & Queue

**Impact:** Medium | **Effort:** Medium

Alpaca and OpenAI API calls use simple delays (`sleep(500)`, `sleep(1500)`) to avoid rate limits. A proper queue with backoff would be more robust.

- Job queue (e.g., using `bull` or `p-queue`) for API calls
- Configurable concurrency and rate limits per API
- Retry with exponential backoff and jitter
- Queue status visible in the UI (queued/processing/done)

### 6.4 Automated Testing Suite

**Impact:** Medium | **Effort:** Medium

There are no tests in the project. Adding tests would increase confidence when making changes.

- Unit tests for `strategy.js` indicator calculations (pure functions, easy to test)
- Integration tests for API routes with a test database
- Mock Alpaca and OpenAI responses for deterministic testing
- CI pipeline (GitHub Actions) running tests on PRs

### 6.5 Logging & Observability

**Impact:** Low | **Effort:** Low

Logging is currently `console.log` / `console.error` throughout. Structured logging would improve debuggability.

- Use a structured logger (e.g., `pino` or `winston`) with JSON output
- Log levels (debug, info, warn, error) configurable via environment variable
- Request/response logging middleware for Express
- Optional log persistence to file for post-mortem analysis

### 6.6 Docker & Deployment Packaging

**Impact:** Low | **Effort:** Low

The app runs locally with `npm run dev`. Packaging it in Docker would simplify deployment and environment consistency.

- Dockerfile for the backend (Node.js + SQLite)
- Docker Compose file for running both frontend and backend
- Persistent volume mount for the SQLite database
- Environment variable configuration via `.env` file or Docker secrets

---

## 7. Data Export & Integration Enhancements

### 7.1 Trade Data Export (CSV / JSON)

**Impact:** Medium | **Effort:** Low

Trade history is session-only and there is no export functionality. Users should be able to export their data for external analysis.

- "Export CSV" and "Export JSON" buttons on the Trades page
- Include all trade fields plus computed stats
- Export candidates/scan results as well
- Configurable date range for export

### 7.2 Multi-Account / Profile Support

**Impact:** Medium | **Effort:** Medium

The app uses a single set of Alpaca credentials from `.env`. Supporting multiple profiles would allow switching between paper and live accounts, or between different brokerage accounts.

- Profile selector in Settings (e.g., "Paper Account," "Live Account")
- Per-profile Alpaca credentials stored encrypted in the database
- Visual indicator of which profile is active (especially important for paper vs. live)
- Confirmation dialog when switching to a live account

### 7.3 Webhook API for External Integrations

**Impact:** Low | **Effort:** Low

Expose webhook endpoints so external tools (e.g., TradingView alerts, Zapier, custom scripts) can trigger scans or submit trade signals.

- `POST /api/webhook/scan` to trigger a scan with optional symbol filter
- `POST /api/webhook/signal` to inject an external signal as a candidate
- API key authentication for webhook endpoints
- Webhook activity log

---

## Priority Recommendations

For the highest-value improvements with reasonable effort, consider this implementation order:

| Priority | Enhancement | Impact | Effort |
|----------|-------------|--------|--------|
| 1 | Persistent Trade History (1.2) | High | Low |
| 2 | Trade Data Export (7.1) | Medium | Low |
| 3 | Real-Time Alerts (4.1) | High | Medium |
| 4 | Position Monitoring & Auto-Close (2.3) | Medium | Medium |
| 5 | Equity Curve & Performance Charts (1.3) | Medium | Medium |
| 6 | Volume Analysis (1.4) | Medium | Low |
| 7 | Backtesting Engine (1.1) | High | High |
| 8 | Autonomous Trading Mode (2.2) | High | High |
| 9 | Crypto Order Execution (2.1) | High | Medium |
| 10 | Embedded TradingView Charts (5.2) | Medium | Low |
