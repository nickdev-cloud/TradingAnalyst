# Trading Strategy Application

Local trading strategy POC: scan assets on a schedule, run **200 MA trend + Bravo 9 reversal + RSI + MACD** with OpenAI analysis (confluence and momentum prediction), and execute paper trades via Alpaca. Admin panel for settings, candidates, and trade history. Supports stocks and crypto **data** (e.g. ETH/USD); execution is stock-only.

## Prerequisites

- Node.js 18+
- Alpaca paper trading account ([Alpaca](https://app.alpaca.markets/paper/dashboard/overview))
- OpenAI API key

## Setup

### Backend

```bash
cd app/backend
cp .env.example .env
# Edit .env: set ALPACA_API_KEY, ALPACA_SECRET_KEY, OPENAI_API_KEY
npm install
npm start
```

Backend runs at `http://localhost:3001`. Uses **paper trading** by default (`ALPACA_PAPER=true`).

### Frontend

```bash
cd app/frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api` to the backend.

## Environment (backend `.env`)

| Variable | Description |
|----------|-------------|
| `ALPACA_API_KEY` | Alpaca API key |
| `ALPACA_SECRET_KEY` | Alpaca secret key |
| `ALPACA_PAPER` | `true` for paper, `false` for live |
| `OPENAI_API_KEY` | OpenAI API key for analysis |
| `PORT` | Backend port (default 3001) |

## Features

- **Settings**: Asset tickers (stocks and crypto symbols e.g. ETH/USD), timeframes, scan frequency (cron), strategy params (MA periods, RSI), OpenAI **model dropdown** (from OpenAI `/v1/models`), system prompt.
- **Dashboard**: **Run scan now** (full scan with OpenAI) or **Scan without OpenAI** (indicators only). Candidates table: Symbol, Timeframe, Side, Confidence, RSI, Bravo 9, **200 MA**, **MACD**, Entry, SL/TP, **Momentum** (prediction), Analysis; rows for executed trades are highlighted. Execute modal with entry price, quantity, SL/TP and validation.
- **Trades**: Session-only trade history (cleared on backend restart), table and stats (win rate, total PnL, avg win/loss). Timeframe stored per trade.
- **Scheduler**: Runs scan at configured cron (e.g. every 15 min when market is open).
- **Strategy / indicators**: **200 MA** = overall trend (price above = bullish, below = bearish; how to trade). **Bravo 9** = reversal potential (strong_bullish/strong_bearish). **RSI** and **MACD** = momentum (overbought/oversold, MACD signal). Strong confluence across these drives recommendations. Current price from Alpaca latest-trade when available.
- **OpenAI**: One isolated session per (symbol, timeframe); prompt includes 200 MA trend, Bravo 9, RSI, MACD, MAs. Model gives a **momentum prediction** and recommends long/short only when confluence is strong; otherwise "none".

## Data & pricing

- **Bar end time**: Free-tier Alpaca bars use an end time 1 hour in the past to avoid “recent SIP data” restrictions. **Stocks**: Data API v2. **Crypto** (e.g. ETH/USD): v1beta3 crypto API; execution for crypto is not supported (stock orders only).
- **Current / entry price**: **Stocks**: from Alpaca latest-trade when available (consistent across timeframes). **Crypto**: latest-trade is not used; entry/current price comes from last bar close.
## Project reference

See [../roadmap.md](../roadmap.md) for the full development plan, stack, workflows, progress, and future enhancements.
