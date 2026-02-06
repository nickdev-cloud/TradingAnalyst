/**
 * Build TradingView chart URL for a symbol and optional timeframe.
 * Opens in new tab with chart and interval pre-selected.
 */
const INTERVAL_MAP = {
  '1Min': '1',
  '5Min': '5',
  '15Min': '15',
  '30Min': '30',
  '1Hour': '60',
  '2Hour': '120',
  '4Hour': '240',
  '6Hour': '360',
  '1Day': '1D',
  '1Week': '1W',
  '1Month': '1M',
};

export function getTradingViewChartUrl(symbol, timeframe) {
  if (!symbol) return 'https://www.tradingview.com/chart/';
  const sym = String(symbol).trim().toUpperCase();
  const base = 'https://www.tradingview.com/chart/';
  const params = new URLSearchParams();
  params.set('symbol', sym);
  if (timeframe && INTERVAL_MAP[timeframe]) {
    params.set('interval', INTERVAL_MAP[timeframe]);
  }
  return `${base}?${params.toString()}`;
}
