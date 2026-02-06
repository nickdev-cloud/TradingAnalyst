import { useState, useEffect, useRef, useCallback } from 'react';
import { getSettings, updateSettings, getOpenAIModels, searchAssets } from '../api/client';

const ASSET_SYMBOL_REGEX = /^[A-Z0-9./]+$/i;

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [timeframesText, setTimeframesText] = useState('');
  const [maPeriodsText, setMaPeriodsText] = useState('');
  const [openaiModels, setOpenaiModels] = useState([]);
  const [modelsError, setModelsError] = useState(null);
  const [assetSearchInput, setAssetSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setTimeframesText((s.timeframes || []).join(', '));
        setMaPeriodsText(Array.isArray(s.strategy?.maPeriods) ? s.strategy.maPeriods.join(', ') : '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getOpenAIModels()
      .then((data) => setOpenaiModels(data.models || []))
      .catch((e) => setModelsError(e.message));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    const maPeriods = maPeriodsText.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
    const payload = {
      ...settings,
      assets: Array.isArray(settings.assets) ? settings.assets : [],
      timeframes: timeframesText.split(',').map((t) => t.trim()).filter(Boolean),
      schedulerEnabled: settings.schedulerEnabled !== false,
      strategy: { ...settings.strategy, maPeriods: maPeriods.length ? maPeriods : [20, 50, 200] },
    };
    try {
      const updated = await updateSettings(payload);
      setSettings(updated);
      setTimeframesText((updated.timeframes || []).join(', '));
      setMaPeriodsText(Array.isArray(updated.strategy?.maPeriods) ? updated.strategy.maPeriods.join(', ') : '');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const assets = Array.isArray(settings?.assets) ? settings.assets : [];

  const addAsset = useCallback((symbol) => {
    const s = (symbol || '').trim().toUpperCase();
    if (!s) return;
    setSettings((prev) => {
      const list = prev.assets || [];
      if (list.includes(s)) return prev;
      return { ...prev, assets: [...list, s] };
    });
    setAssetSearchInput('');
    setSearchResults([]);
    setSearchError(null);
  }, []);

  const removeAsset = useCallback((symbol) => {
    setSettings((prev) => ({
      ...prev,
      assets: (prev.assets || []).filter((a) => a !== symbol),
    }));
  }, []);

  useEffect(() => {
    const q = assetSearchInput.trim();
    if (!q) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      searchAssets(q)
        .then((list) => {
          setSearchResults(Array.isArray(list) ? list : []);
        })
        .catch((e) => {
          setSearchError(e.message);
          setSearchResults([]);
        })
        .finally(() => {
          setSearchLoading(false);
        });
      searchDebounceRef.current = null;
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [assetSearchInput]);

  const handleAssetKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const raw = (assetSearchInput || '').trim();
      if (!raw) return;
      const s = raw.toUpperCase();
      if (!ASSET_SYMBOL_REGEX.test(s)) {
        setSearchError('Use only letters, numbers, and / (e.g. AAPL, ETH/USD).');
        return;
      }
      if (assets.includes(s)) {
        setSearchError('Already added.');
        return;
      }
      addAsset(s);
    }
  };

  const updateStrategy = (key, value) => {
    setSettings((s) => ({ ...s, strategy: { ...s.strategy, [key]: value } }));
  };

  const updateOpenai = (key, value) => {
    setSettings((s) => ({ ...s, openai: { ...s.openai, [key]: value } }));
  };

  if (loading) return <p className="text-muted">Loading settings…</p>;
  if (!settings) return <p className="text-muted">Failed to load settings.</p>;

  return (
    <div>
      <h1 className="page-header">Settings</h1>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSave}>
        <div className="settings-grid">
        <section className="form-section card">
          <h2 className="form-section-title">Assets</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {assets.map((symbol) => (
              <span
                key={symbol}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {symbol}
                <button
                  type="button"
                  onClick={() => removeAsset(symbol)}
                  aria-label={`Remove ${symbol}`}
                  style={{
                    padding: 0,
                    margin: 0,
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ position: 'relative', maxWidth: 400 }}>
            <input
              type="text"
              className="input"
              value={assetSearchInput}
              onChange={(e) => setAssetSearchInput(e.target.value)}
              onKeyDown={handleAssetKeyDown}
              onBlur={() => setTimeout(() => setSearchResults([]), 150)}
              placeholder="Search or type symbol (e.g. AAPL, ETH/USD) and press Enter"
            />
            {searchLoading && (
              <span className="form-hint" style={{ marginTop: 4, display: 'block' }}>Searching…</span>
            )}
            {searchError && !searchLoading && (
              <span className="form-hint" style={{ marginTop: 4, color: 'var(--danger-muted)', display: 'block' }}>{searchError}</span>
            )}
            {searchResults.length > 0 && assetSearchInput.trim() && (
              <ul
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  margin: 0,
                  marginTop: 4,
                  padding: 0,
                  listStyle: 'none',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  maxHeight: 240,
                  overflowY: 'auto',
                  zIndex: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
              >
                {searchResults.map((item) => (
                  <li key={item.symbol}>
                    <button
                      type="button"
                      onClick={() => addAsset(item.symbol)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: 'none',
                        background: 'none',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: 'var(--text-sm)',
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <strong>{item.symbol}</strong>
                      {item.name && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{item.name}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <span className="form-hint">Search by ticker or name, or type a symbol and press Enter to add. Stocks and crypto (e.g. ETH/USD) supported.</span>
        </section>
        <section className="form-section card">
          <h2 className="form-section-title">Timeframes</h2>
          <input
            type="text"
            className="input"
            value={timeframesText}
            onChange={(e) => setTimeframesText(e.target.value)}
            placeholder="1Day, 1Hour, 1Month"
          />
          <span className="form-hint">
            Comma-separated. Allowed: 1Min, 5Min, 15Min, 30Min, 1Hour, 2Hour, 4Hour, 6Hour, 1Day, 1Week, 1Month (case-insensitive).
          </span>
        </section>
        <section className="form-section card">
          <h2 className="form-section-title">Automatic scan (cron)</h2>
          <div className="form-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.schedulerEnabled !== false}
                onChange={(e) => setSettings((s) => ({ ...s, schedulerEnabled: e.target.checked }))}
              />
              <span className="form-label" style={{ marginBottom: 0 }}>Enable automatic scan</span>
            </label>
            <span className="form-hint">When enabled, the app runs a scan on the schedule below (when market is open). Disable to run scans only manually from the Dashboard.</span>
          </div>
          <div className="form-row">
            <label className="form-label">Schedule (cron expression)</label>
            <input
              type="text"
              className="input"
              value={settings.scanFrequencyCron || ''}
              onChange={(e) => setSettings((s) => ({ ...s, scanFrequencyCron: e.target.value }))}
              placeholder="*/15 * * * *"
            />
            <div className="form-hint" style={{ marginTop: 8 }}>
              <strong>Cron format:</strong> <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4 }}>minute hour day month weekday</code>
              <br />All five fields are required (space-separated). Use <code>*</code> for “every” and <code>*/N</code> for “every N”.
            </div>
            <ul className="text-small" style={{ marginTop: 8, paddingLeft: 20, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <li><code>*/15 * * * *</code> — every 15 <strong>minutes</strong></li>
              <li><code>0 * * * *</code> — every <strong>hour</strong> (at :00)</li>
              <li><code>0 */4 * * *</code> — every 4 <strong>hours</strong></li>
              <li><code>0 9 * * *</code> — once per <strong>day</strong> at 9:00 AM</li>
              <li><code>0 9 * * 1-5</code> — weekdays at 9:00 AM (Mon–Fri)</li>
            </ul>
          </div>
        </section>
        <section className="form-section card">
          <h2 className="form-section-title">Strategy</h2>
          <div className="form-row">
            <label className="form-label">MA periods (comma-separated)</label>
            <input
              type="text"
              className="input"
              style={{ maxWidth: 200 }}
              value={maPeriodsText}
              onChange={(e) => setMaPeriodsText(e.target.value)}
              placeholder="20, 50, 200"
            />
            <span className="form-hint">e.g. 20, 50, 200</span>
          </div>
          <div className="form-row">
            <label className="form-label">RSI period</label>
            <input
              type="number"
              min="1"
              className="input"
              style={{ maxWidth: 80 }}
              value={settings.strategy?.rsiPeriod ?? 14}
              onChange={(e) => updateStrategy('rsiPeriod', parseInt(e.target.value, 10))}
            />
          </div>
          <div className="form-row">
            <label className="form-label">RSI oversold / overbought</label>
            <input
              type="text"
              className="input"
              style={{ maxWidth: 120 }}
              value={`${settings.strategy?.rsiOversold ?? 30} / ${settings.strategy?.rsiOverbought ?? 70}`}
              onChange={(e) => {
                const [o, b] = e.target.value.split('/').map((n) => parseInt(n.trim(), 10));
                if (!isNaN(o)) updateStrategy('rsiOversold', o);
                if (!isNaN(b)) updateStrategy('rsiOverbought', b);
              }}
            />
          </div>
        </section>
        <section className="form-section card">
          <h2 className="form-section-title">OpenAI</h2>
          <div className="form-row">
            <label className="form-label">Model</label>
            <select
              className="select"
              value={settings.openai?.model || ''}
              onChange={(e) => updateOpenai('model', e.target.value)}
            >
              {openaiModels.length === 0 && !modelsError && (
                <>
                  {settings.openai?.model && <option value={settings.openai.model}>{settings.openai.model}</option>}
                  <option value="" disabled>Loading models…</option>
                </>
              )}
              {modelsError && <option value={settings.openai?.model || ''}>{settings.openai?.model || '—'}</option>}
              {openaiModels.length > 0 && !settings.openai?.model && <option value="">— Select model —</option>}
              {openaiModels.length > 0 && settings.openai?.model && !openaiModels.some((m) => m.id === settings.openai?.model) && (
                <option value={settings.openai?.model}>{settings.openai.model} (current)</option>
              )}
              {openaiModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
            {modelsError && <span className="form-hint" style={{ color: 'var(--danger-muted)' }}>{modelsError}</span>}
            <span className="form-hint">Models your API key can access (from OpenAI /v1/models).</span>
          </div>
          <div className="form-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.openai?.logResponsesToConsole !== false}
                onChange={(e) => updateOpenai('logResponsesToConsole', e.target.checked)}
              />
              <span className="form-label" style={{ marginBottom: 0 }}>Log OpenAI requests and responses to console</span>
            </label>
            <span className="form-hint">When enabled, the backend logs each prompt and parsed response for debugging. Disable to reduce console noise.</span>
          </div>
          <div className="form-row">
            <label className="form-label">System prompt</label>
            <textarea
              className="textarea"
              value={settings.openai?.systemPrompt || ''}
              onChange={(e) => updateOpenai('systemPrompt', e.target.value)}
              rows={4}
            />
          </div>
        </section>
        <div className="form-actions">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
        </div>
      </form>
    </div>
  );
}
