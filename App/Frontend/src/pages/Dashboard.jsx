import { useState, useCallback, useEffect, useMemo } from 'react';
import { runScan, getCandidates, getTrades, executeTrade, getScanProgress } from '../api/client';
import ExecuteModal from '../components/ExecuteModal';
import { getTradingViewChartUrl } from '../utils/tradingView';

function getIndicatorRowValue(row, col) {
  const ind = row.indicators || {};
  const trend200 = ind.trend200?.trend;
  const rsi = ind.rsi?.rsi;
  const obos = ind.rsi?.overbought ? 'OB' : ind.rsi?.oversold ? 'OS' : '';
  const macd = ind.macd?.signal;
  const b9 = ind.bravo9?.signal;
  switch (col) {
    case 'symbol': return (row.symbol || '').toLowerCase();
    case 'tf': return (row.timeframe || '').toLowerCase();
    case 'bars': return row.barCount ?? -1;
    case 'price': return ind.currentPrice != null ? Number(ind.currentPrice) : -Infinity;
    case '200ma': return (trend200 || '').toLowerCase();
    case 'rsi': return rsi != null ? Number(rsi) : -1;
    case 'obos': return (obos || '').toLowerCase();
    case 'macd': return (macd || '').toLowerCase();
    case 'bravo9': return (b9 || '').toLowerCase();
    case 'barsEma9': return ind.bravo9?.barsSinceEma9Cross ?? -1;
    default: return '';
  }
}

/** Confluence of MACD, RSI, Bravo 9: higher |score| = better alignment (bullish or bearish). */
function getConfluenceScore(row) {
  const ind = row.indicators || {};
  let macd = 0;
  if (ind.macd?.signal === 'bullish') macd = 1;
  else if (ind.macd?.signal === 'bearish') macd = -1;
  let rsi = 0;
  if (ind.rsi?.oversold) rsi = 1;
  else if (ind.rsi?.overbought) rsi = -1;
  let b9 = 0;
  const s = ind.bravo9?.signal;
  if (s === 'strong_bullish') b9 = 2;
  else if (s === 'bullish') b9 = 1;
  else if (s === 'strong_bearish') b9 = -2;
  else if (s === 'bearish') b9 = -1;
  return macd + rsi + b9;
}

export default function Dashboard() {
  const [candidates, setCandidates] = useState([]);
  const [trades, setTrades] = useState([]);
  const [scannedAt, setScannedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [executeCandidate, setExecuteCandidate] = useState(null);
  const [indicatorsOnly, setIndicatorsOnly] = useState(null);
  // Indicators table: sort
  const [indicatorsSortCol, setIndicatorsSortCol] = useState('symbol');
  const [indicatorsSortDir, setIndicatorsSortDir] = useState('asc');
  // Indicators table: filters (empty string = no filter)
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterTf, setFilterTf] = useState('');
  const [filter200, setFilter200] = useState('');
  const [filterObOs, setFilterObOs] = useState('');
  const [filterMacd, setFilterMacd] = useState('');
  const [filterBravo9, setFilterBravo9] = useState('');
  const [scanProgress, setScanProgress] = useState(null);

  const loadCandidates = useCallback(async () => {
    try {
      const data = await getCandidates();
      setCandidates(data.candidates ?? []);
      setScannedAt(data.lastScannedAt ?? null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadTrades = useCallback(async () => {
    try {
      const list = await getTrades();
      setTrades(list);
    } catch (e) {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    loadCandidates();
    loadTrades();
  }, [loadCandidates, loadTrades]);

  useEffect(() => {
    if (!loading) return;
    setScanProgress(null);
    const interval = setInterval(async () => {
      try {
        const p = await getScanProgress();
        setScanProgress(p);
      } catch (_) {}
    }, 500);
    return () => clearInterval(interval);
  }, [loading]);

  const handleRunScan = async (indicatorOnly = false) => {
    setLoading(true);
    setError(null);
    setIndicatorsOnly(null);
    try {
      const data = await runScan({ indicatorOnly });
      if (indicatorOnly) {
        setIndicatorsOnly(data.indicatorsOnly || []);
        setScannedAt(data.scannedAt);
      } else {
        setCandidates(data.candidates || []);
        setScannedAt(data.scannedAt);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = (c) => setExecuteCandidate(c);
  const handleExecuteClose = () => setExecuteCandidate(null);
  const handleExecuteConfirm = async (payload) => {
    try {
      await executeTrade(payload);
      setExecuteCandidate(null);
      loadTrades();
    } catch (e) {
      setError(e.message);
    }
  };

  const isExecuted = useCallback(
    (c) => trades.some((t) => t.symbol === c.symbol && t.timeframe === c.timeframe),
    [trades]
  );

  const bravo9Color = (signal) =>
    signal === 'strong_bullish' ? 'var(--success)' : signal === 'bullish' ? 'var(--success-muted)' : signal === 'strong_bearish' ? 'var(--danger)' : signal === 'bearish' ? 'var(--danger-muted)' : undefined;
  const trendColor = (trend) =>
    trend === 'bullish' ? 'var(--success-muted)' : trend === 'bearish' ? 'var(--danger-muted)' : undefined;

  const indicatorsFilteredAndSorted = useMemo(() => {
    if (!indicatorsOnly || indicatorsOnly.length === 0) return [];
    let list = [...indicatorsOnly];
    const ind = (row) => row.indicators || {};
    const trend200 = (row) => ind(row).trend200?.trend || '';
    const obos = (row) => ind(row).rsi?.overbought ? 'OB' : ind(row).rsi?.oversold ? 'OS' : '';
    const macd = (row) => ind(row).macd?.signal || '';
    const b9 = (row) => ind(row).bravo9?.signal || '';
    if (filterSymbol.trim()) {
      const q = filterSymbol.trim().toLowerCase();
      list = list.filter((row) => (row.symbol || '').toLowerCase().includes(q));
    }
    if (filterTf.trim()) {
      const q = filterTf.trim().toLowerCase();
      list = list.filter((row) => (row.timeframe || '').toLowerCase().includes(q));
    }
    if (filter200) list = list.filter((row) => trend200(row) === filter200);
    if (filterObOs) list = list.filter((row) => (obos(row) || '').toLowerCase() === filterObOs.toLowerCase());
    if (filterMacd) list = list.filter((row) => macd(row) === filterMacd);
    if (filterBravo9) list = list.filter((row) => b9(row) === filterBravo9);
    const col = indicatorsSortCol;
    const dir = indicatorsSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const va = getIndicatorRowValue(a, col);
      const vb = getIndicatorRowValue(b, col);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return cmp * dir;
    });
    return list;
  }, [indicatorsOnly, indicatorsSortCol, indicatorsSortDir, filterSymbol, filterTf, filter200, filterObOs, filterMacd, filterBravo9]);

  const bestConfluenceIndex = useMemo(() => {
    if (!indicatorsFilteredAndSorted.length) return null;
    let bestIdx = 0;
    let bestAbs = Math.abs(getConfluenceScore(indicatorsFilteredAndSorted[0]));
    indicatorsFilteredAndSorted.forEach((row, i) => {
      const abs = Math.abs(getConfluenceScore(row));
      if (abs > bestAbs) {
        bestAbs = abs;
        bestIdx = i;
      }
    });
    return bestAbs > 0 ? bestIdx : null;
  }, [indicatorsFilteredAndSorted]);

  const handleIndicatorsSort = (column) => {
    if (indicatorsSortCol === column) {
      setIndicatorsSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setIndicatorsSortCol(column);
      setIndicatorsSortDir('asc');
    }
  };

  const SortableTh = ({ column, label }) => (
    <th
      role="button"
      tabIndex={0}
      onClick={() => handleIndicatorsSort(column)}
      onKeyDown={(e) => e.key === 'Enter' && handleIndicatorsSort(column)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      title={`Sort by ${label}`}
    >
      {label}
      {indicatorsSortCol === column && (
        <span style={{ marginLeft: 4, opacity: 0.8 }} aria-hidden>{indicatorsSortDir === 'asc' ? ' ↑' : ' ↓'}</span>
      )}
    </th>
  );

  return (
    <div>
      <h1 className="page-header">Dashboard</h1>
      <p className="page-description">
        Run a scan to find candidates. Last scan: {scannedAt ? new Date(scannedAt).toLocaleString() : '—'}
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => handleRunScan(false)}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? 'Scanning…' : 'Run scan now'}
        </button>
        <button
          type="button"
          onClick={() => handleRunScan(true)}
          disabled={loading}
          title="Fetch bars from Alpaca and compute indicators only (no OpenAI). Use when over quota."
          className="btn btn-secondary"
        >
          Scan without OpenAI
        </button>
      </div>
      {loading && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                <span>
                  {scanProgress?.running && scanProgress.symbol ? (
                    <>Scanning: <strong style={{ color: 'var(--text-primary)' }}>{scanProgress.symbol} {scanProgress.timeframe}</strong></>
                  ) : (
                    'Starting scan…'
                  )}
                </span>
                <span>
                  {scanProgress?.total != null && scanProgress.total > 0
                    ? `${(scanProgress.current ?? 0) + 1} / ${scanProgress.total}`
                    : '—'}
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--bg-input)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: scanProgress?.total > 0
                      ? `${Math.min(100, (100 * ((scanProgress.current ?? 0) + 1)) / scanProgress.total)}%`
                      : '0%',
                    background: 'var(--accent)',
                    borderRadius: 4,
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              {scanProgress?.indicatorOnly ? 'Indicators only (no AI)' : 'With AI recommendations'}
            </span>
          </div>
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {indicatorsOnly && indicatorsOnly.length > 0 && (
        <section className="card">
          <h2 className="card-header">Last run (no OpenAI) — Alpaca data + indicators</h2>
          <p className="text-muted" style={{ marginTop: -4, marginBottom: 8 }}>
            Showing {indicatorsFilteredAndSorted.length} of {indicatorsOnly.length} rows. Filter and sort below. The <strong>green-highlighted row</strong> is the best confluence of MACD, RSI, and Bravo 9 (EMA9). &quot;Bars since EMA9&quot; = bars since price last crossed the EMA9 line.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <SortableTh column="symbol" label="Symbol" />
                  <SortableTh column="tf" label="TF" />
                  <SortableTh column="bars" label="Bars" />
                  <SortableTh column="price" label="Price" />
                  <SortableTh column="200ma" label="200 MA" />
                  <SortableTh column="rsi" label="RSI" />
                  <SortableTh column="obos" label="OB/OS" />
                  <SortableTh column="macd" label="MACD" />
                  <SortableTh column="bravo9" label="Bravo 9" />
                  <SortableTh column="barsEma9" label="Bars since EMA9" />
                </tr>
                <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-default)' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 'normal', verticalAlign: 'middle' }}>
                    <input
                      type="text"
                      placeholder="Filter…"
                      value={filterSymbol}
                      onChange={(e) => setFilterSymbol(e.target.value)}
                      className="input input-sm"
                      style={{ width: '100%', minWidth: 70, maxWidth: 100 }}
                      aria-label="Filter by symbol"
                    />
                  </th>
                  <th style={{ padding: '6px 8px', fontWeight: 'normal' }}>
                    <input
                      type="text"
                      placeholder="Filter…"
                      value={filterTf}
                      onChange={(e) => setFilterTf(e.target.value)}
                      className="input input-sm"
                      style={{ width: '100%', minWidth: 50, maxWidth: 80 }}
                      aria-label="Filter by timeframe"
                    />
                  </th>
                  <th style={{ padding: '6px 8px', fontWeight: 'normal' }} />
                  <th style={{ padding: '6px 8px', fontWeight: 'normal' }} />
                  <th style={{ padding: '6px 8px', fontWeight: 'normal' }}>
                    <select
                      value={filter200}
                      onChange={(e) => setFilter200(e.target.value)}
                      className="input input-sm"
                      style={{ width: '100%', minWidth: 75 }}
                      aria-label="Filter by 200 MA trend"
                    >
                      <option value="">All</option>
                      <option value="bullish">Bullish</option>
                      <option value="bearish">Bearish</option>
                    </select>
                  </th>
                  <th style={{ padding: '6px 8px', fontWeight: 'normal' }} />
                  <th style={{ padding: '6px 8px', fontWeight: 'normal' }}>
                    <select
                      value={filterObOs}
                      onChange={(e) => setFilterObOs(e.target.value)}
                      className="input input-sm"
                      style={{ width: '100%', minWidth: 60 }}
                      aria-label="Filter by OB/OS"
                    >
                      <option value="">All</option>
                      <option value="ob">OB</option>
                      <option value="os">OS</option>
                    </select>
                  </th>
                  <th style={{ padding: '6px 8px', fontWeight: 'normal' }}>
                    <select
                      value={filterMacd}
                      onChange={(e) => setFilterMacd(e.target.value)}
                      className="input input-sm"
                      style={{ width: '100%', minWidth: 75 }}
                      aria-label="Filter by MACD"
                    >
                      <option value="">All</option>
                      <option value="bullish">Bullish</option>
                      <option value="bearish">Bearish</option>
                    </select>
                  </th>
                  <th style={{ padding: '6px 8px', fontWeight: 'normal' }}>
                    <select
                      value={filterBravo9}
                      onChange={(e) => setFilterBravo9(e.target.value)}
                      className="input input-sm"
                      style={{ width: '100%', minWidth: 90 }}
                      aria-label="Filter by Bravo 9"
                    >
                      <option value="">All</option>
                      <option value="strong_bullish">Strong bullish</option>
                      <option value="bullish">Bullish</option>
                      <option value="strong_bearish">Strong bearish</option>
                      <option value="bearish">Bearish</option>
                    </select>
                  </th>
                  <th style={{ padding: '6px 8px', fontWeight: 'normal' }} />
                </tr>
              </thead>
              <tbody>
                {indicatorsFilteredAndSorted.map((row, i) => {
                  const ind = row.indicators || {};
                  const trend200 = ind.trend200;
                  const rsi = ind.rsi;
                  const macd = ind.macd;
                  const b9 = ind.bravo9;
                  const isBestConfluence = bestConfluenceIndex === i;
                  return (
                    <tr
                      key={i}
                      className={isBestConfluence ? 'confluence-row' : ''}
                      title={isBestConfluence ? 'Best confluence of MACD, RSI, Bravo 9 — good place to start' : undefined}
                    >
                      <td>
                        <a href={getTradingViewChartUrl(row.symbol, row.timeframe)} target="_blank" rel="noopener noreferrer" className="link-external" title="Open in TradingView">
                          {row.symbol}
                        </a>
                      </td>
                      <td>{row.timeframe}</td>
                      <td>{row.barCount}</td>
                      <td>{ind.currentPrice != null ? Number(ind.currentPrice).toFixed(2) : '—'}</td>
                      <td style={{ color: trendColor(trend200?.trend) }} title={trend200 ? `Price ${trend200.above ? '>' : '<'} MA200 (${Number(trend200.ma200).toFixed(2)})` : undefined}>
                        {trend200?.trend || '—'}
                      </td>
                      <td>{rsi?.rsi != null ? Number(rsi.rsi).toFixed(1) : '—'}</td>
                      <td>{rsi?.overbought ? 'OB' : rsi?.oversold ? 'OS' : '—'}</td>
                      <td style={{ color: trendColor(macd?.signal) }}>{macd?.signal || '—'}</td>
                      <td style={{ color: bravo9Color(b9?.signal) }}>
                        {b9 ? (
                          <span title={`EMA9 ${(b9.ema9 ?? b9.sma9)?.toFixed(2)} / EMA20 ${b9.ema20?.toFixed(2)} / SMA180 ${b9.sma180?.toFixed(2)}`}>
                            {(b9.signal || '').replace('_', ' ')}
                          </span>
                        ) : '—'}
                      </td>
                      <td title={b9?.barsSinceEma9Cross != null ? 'Bars since close last crossed EMA9' : undefined}>
                        {b9?.barsSinceEma9Cross != null ? b9.barsSinceEma9Cross : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details style={{ marginTop: 12 }}>
            <summary className="details-summary">Raw JSON</summary>
            <pre style={{ margin: '8px 0 0', fontSize: 11, overflow: 'auto', maxHeight: 200, background: 'var(--bg-input)', padding: 12, borderRadius: 6 }}>{JSON.stringify(indicatorsOnly, null, 2)}</pre>
          </details>
        </section>
      )}
      <section>
        <h2 className="card-header">Candidates</h2>
        {candidates.length === 0 ? (
          <p className="text-muted">No candidates yet. Run a scan or check back after the next scheduled run.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Timeframe</th>
                  <th>Side</th>
                  <th>Confidence</th>
                  <th>RSI</th>
                  <th>Bravo 9</th>
                  <th>200 MA</th>
                  <th>MACD</th>
                  <th>Entry</th>
                  <th>SL / TP</th>
                  <th style={{ minWidth: 160 }}>Momentum</th>
                  <th style={{ minWidth: 200 }}>Analysis</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const b9 = typeof c.bravo9 === 'string' ? (() => { try { return JSON.parse(c.bravo9); } catch { return null; } })() : c.bravo9;
                  const executed = isExecuted(c);
                  return (
                    <tr
                      key={c.id || `${c.symbol}-${c.timeframe}`}
                      className={executed ? 'highlight-row' : ''}
                      title={executed ? 'Trade executed for this opportunity' : undefined}
                    >
                      <td>
                        <a href={getTradingViewChartUrl(c.symbol, c.timeframe)} target="_blank" rel="noopener noreferrer" className="link-external" title="Open in TradingView">
                          {c.symbol}
                        </a>
                      </td>
                      <td>{c.timeframe}</td>
                      <td className={c.side === 'long' ? 'side-long' : 'side-short'}>{c.side}</td>
                      <td>{c.confidence != null ? (c.confidence * 100).toFixed(0) + '%' : '—'}</td>
                      <td style={{ color: c.rsi != null ? (c.rsi > 70 ? 'var(--danger-muted)' : c.rsi < 30 ? 'var(--success-muted)' : undefined) : undefined }}>
                        {c.rsi != null ? Number(c.rsi).toFixed(1) : '—'}
                      </td>
                      <td style={{ color: bravo9Color(c.bravo9_signal) }} title={b9 ? `EMA9 ${(b9.ema9 ?? b9.sma9)?.toFixed(2)} / EMA20 ${b9.ema20?.toFixed(2)} / SMA180 ${b9.sma180?.toFixed(2)}` : undefined}>
                        {c.bravo9_signal ? String(c.bravo9_signal).replace(/_/g, ' ') : '—'}
                      </td>
                      <td style={{ color: trendColor(c.trend_200 || c.trend_signal) }} title="Price above/below 200 MA">
                        {c.trend_200 || c.trend_signal || '—'}
                      </td>
                      <td style={{ color: trendColor(c.macd_signal) }}>{c.macd_signal || '—'}</td>
                      <td>{c.current_price != null ? Number(c.current_price).toFixed(2) : '—'}</td>
                      <td>{[c.stop_loss, c.take_profit].filter(Boolean).join(' / ') || '—'}</td>
                      <td style={{ maxWidth: 220, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.3 }}>
                        {c.momentum_prediction ? (
                          <span title={c.momentum_prediction}>{(c.momentum_prediction || '').slice(0, 60)}{(c.momentum_prediction || '').length > 60 ? '…' : ''}</span>
                        ) : '—'}
                      </td>
                      <td style={{ maxWidth: 320, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {c.raw_response ? (
                          <details>
                            <summary style={{ cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {(c.raw_response || '').slice(0, 80)}{(c.raw_response || '').length > 80 ? '…' : ''}
                            </summary>
                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-default)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.raw_response}</div>
                          </details>
                        ) : '—'}
                      </td>
                      <td>
                        <button type="button" onClick={() => handleExecute(c)} className="btn btn-secondary btn-sm">
                          Execute
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {executeCandidate && (
        <ExecuteModal
          candidate={executeCandidate}
          onClose={handleExecuteClose}
          onConfirm={handleExecuteConfirm}
        />
      )}
    </div>
  );
}
