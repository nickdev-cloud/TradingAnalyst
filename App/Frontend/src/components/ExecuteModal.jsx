import { useState } from 'react';

function isValidTakeProfit(side, entryPrice, tp) {
  if (entryPrice == null || tp == null || tp === '') return true;
  const e = Number(entryPrice);
  const t = Number(tp);
  if (isNaN(e) || isNaN(t)) return true;
  const minGap = 0.01;
  if (side === 'short') return t <= e - minGap;
  if (side === 'long') return t >= e + minGap;
  return true;
}

export default function ExecuteModal({ candidate, onClose, onConfirm }) {
  const entryRef = candidate.current_price != null ? Number(candidate.current_price) : null;
  const suggestedTp = candidate.take_profit != null ? Number(candidate.take_profit) : null;
  const side = (candidate.side || '').toLowerCase();
  const tpValidForSide =
    entryRef == null || suggestedTp == null || suggestedTp === ''
      ? true
      : side === 'short'
        ? suggestedTp <= entryRef - 0.01
        : side === 'long'
          ? suggestedTp >= entryRef + 0.01
          : true;
  const [quantity, setQuantity] = useState(candidate.suggested_size || 1);
  const [orderType, setOrderType] = useState('limit');
  const [limitPrice, setLimitPrice] = useState(candidate.current_price ?? '');
  const [stopLoss, setStopLoss] = useState(candidate.stop_loss ?? '');
  const [takeProfit, setTakeProfit] = useState(tpValidForSide ? (candidate.take_profit ?? '') : '');
  const [submitting, setSubmitting] = useState(false);
  const [takeProfitError, setTakeProfitError] = useState(null);

  const entryPrice = orderType === 'limit' && limitPrice !== '' ? Number(limitPrice) : candidate.current_price != null ? Number(candidate.current_price) : null;
  const tpInvalid = takeProfit !== '' && entryPrice != null && !isValidTakeProfit(side, entryPrice, takeProfit);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (orderType === 'limit' && !limitPrice) return;
    if (tpInvalid) {
      setTakeProfitError(side === 'short' ? 'Take profit must be below entry price for a short.' : 'Take profit must be above entry price for a long.');
      return;
    }
    setTakeProfitError(null);
    setSubmitting(true);
    try {
      await onConfirm({
        symbol: candidate.symbol,
        side: candidate.side,
        quantity: Number(quantity),
        orderType,
        limitPrice: orderType === 'limit' && limitPrice ? Number(limitPrice) : undefined,
        stopLoss: stopLoss ? Number(stopLoss) : undefined,
        takeProfit: takeProfit ? Number(takeProfit) : undefined,
        timeframe: candidate.timeframe,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="execute-modal-title"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="execute-modal-title" className="modal-title">Execute trade</h3>
        <p className="modal-subtitle">
          {candidate.symbol} — {candidate.side}
          {candidate.confidence != null && (
            <span style={{ marginLeft: 8 }}>Confidence: {(candidate.confidence * 100).toFixed(0)}%</span>
          )}
        </p>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: 'var(--text-sm)' }}>
          <strong>Entry price:</strong>{' '}
          {orderType === 'limit'
            ? (limitPrice ? `$${Number(limitPrice).toFixed(2)} (limit)` : candidate.current_price != null ? `Set below — ref: $${Number(candidate.current_price).toFixed(2)}` : 'Set limit price')
            : candidate.current_price != null
              ? `~ $${Number(candidate.current_price).toFixed(2)} (market)`
              : 'Market (fill at execution)'}
        </p>
        {candidate.raw_response && (
          <div className="card" style={{ marginBottom: 16, padding: 12 }}>
            <div className="card-header-sm">Model analysis — why this trade</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{candidate.raw_response}</div>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <label className="form-label">Order type</label>
              <select
                className="select"
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
              >
                <option value="market">Market (fill at current price)</option>
                <option value="limit">Limit (fill at or better than your price)</option>
              </select>
            </div>
            {orderType === 'limit' && (
              <div className="form-row">
                <label className="form-label">Limit price (entry)</label>
                <input
                  type="number"
                  step="0.01"
                  required={orderType === 'limit'}
                  className="input"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder={candidate.current_price ? `e.g. ${candidate.current_price}` : 'e.g. 150.00'}
                />
                <span className="form-hint">Long: buy at or below this price. Short: sell at or above this price.</span>
              </div>
            )}
            <div className="form-row">
              <label className="form-label">Quantity</label>
              <input
                type="number"
                min="1"
                step="1"
                className="input"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label className="form-label">Stop loss (optional)</label>
              <span className="form-hint">Exit at market when price hits this level</span>
              <input
                type="number"
                step="0.01"
                className="input"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="e.g. 150.00"
              />
            </div>
            <div className="form-row">
              <label className="form-label">Take profit (optional)</label>
              <span className="form-hint">Limit sell/buy when price reaches target</span>
              <input
                type="number"
                step="0.01"
                className={`input ${tpInvalid ? 'input-error' : ''}`}
                value={takeProfit}
                onChange={(e) => { setTakeProfit(e.target.value); setTakeProfitError(null); }}
                placeholder={side === 'short' ? 'Below entry (e.g. 420)' : 'Above entry (e.g. 450)'}
              />
              <span className="form-hint">
                {side === 'short' ? 'Short: take profit must be below entry (you buy back cheaper).' : 'Long: take profit must be above entry (you sell higher).'}
              </span>
              {takeProfitError && <p className="form-hint" style={{ color: 'var(--danger-muted)', marginTop: 6 }}>{takeProfitError}</p>}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (orderType === 'limit' && !limitPrice) || tpInvalid}
              className="btn btn-primary"
            >
              {submitting ? 'Placing…' : 'Place order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
