import { useState, useEffect } from 'react';
import { getTrades, getTradeStats } from '../api/client';
import { getTradingViewChartUrl } from '../utils/tradingView';

export default function Trades() {
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    Promise.all([getTrades(), getTradeStats()])
      .then(([t, s]) => {
        setTrades(t);
        setStats(s);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      <h1 className="page-header">Trades</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {stats && (
        <section className="card">
          <h2 className="card-header">Statistics</h2>
          <div className="stats-grid">
            <div className="stat-item">
              Total trades
              <strong>{stats.totalTrades}</strong>
            </div>
            <div className="stat-item">
              Wins
              <strong className="stat-positive">{stats.wins}</strong>
            </div>
            <div className="stat-item">
              Losses
              <strong className="stat-negative">{stats.losses}</strong>
            </div>
            <div className="stat-item">
              Win rate
              <strong>{(stats.winRate ?? 0).toFixed(1)}%</strong>
            </div>
            <div className="stat-item">
              Total P&amp;L
              <strong style={{ color: (stats.totalPnl ?? 0) >= 0 ? 'var(--success-muted)' : 'var(--danger-muted)' }}>
                {(stats.totalPnl ?? 0).toFixed(2)}
              </strong>
            </div>
            <div className="stat-item">
              Avg win
              <strong className="stat-positive">{(stats.avgWin ?? 0).toFixed(2)}</strong>
            </div>
            <div className="stat-item">
              Avg loss
              <strong className="stat-negative">{(stats.avgLoss ?? 0).toFixed(2)}</strong>
            </div>
          </div>
        </section>
      )}
      <section>
        <h2 className="card-header">Trade history</h2>
        {trades.length === 0 ? (
          <p className="text-muted">No trades yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>SL / TP</th>
                  <th>Exit reason</th>
                  <th>P&amp;L</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <a href={getTradingViewChartUrl(t.symbol, t.timeframe)} target="_blank" rel="noopener noreferrer" className="link-external" title="Open in TradingView">
                        {t.symbol}
                      </a>
                    </td>
                    <td className={t.side === 'buy' ? 'side-long' : 'side-short'}>{t.side}</td>
                    <td>{t.quantity}</td>
                    <td>{t.entry_price != null ? Number(t.entry_price).toFixed(2) : '—'}</td>
                    <td>{t.exit_price != null ? Number(t.exit_price).toFixed(2) : '—'}</td>
                    <td>{[t.stop_loss, t.take_profit].filter(Boolean).map((n) => Number(n).toFixed(2)).join(' / ') || '—'}</td>
                    <td>{t.exit_reason || '—'}</td>
                    <td style={{ color: t.pnl != null ? (t.pnl >= 0 ? 'var(--success-muted)' : 'var(--danger-muted)') : undefined }}>
                      {t.pnl != null ? Number(t.pnl).toFixed(2) : '—'}
                    </td>
                    <td>{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
