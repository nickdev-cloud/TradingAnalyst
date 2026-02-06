const base = '/api';

export async function getSettings() {
  const r = await fetch(`${base}/settings`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getOpenAIModels() {
  const r = await fetch(`${base}/settings/openai-models`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateSettings(body) {
  const r = await fetch(`${base}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function searchAssets(query) {
  const q = (query || '').trim();
  if (!q) return [];
  const r = await fetch(`${base}/assets/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function runScan(opts = {}) {
  const r = await fetch(`${base}/scan/run?indicatorOnly=${opts.indicatorOnly ? 'true' : 'false'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ indicatorOnly: opts.indicatorOnly || false }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getScanProgress() {
  const r = await fetch(`${base}/scan/progress`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getCandidates() {
  const r = await fetch(`${base}/scan/candidates`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function executeTrade({ symbol, side, quantity, orderType, limitPrice, stopLoss, takeProfit, timeframe }) {
  const r = await fetch(`${base}/scan/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, side, quantity, orderType, limitPrice, stopLoss, takeProfit, timeframe }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getTrades(params = {}) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${base}/trades${q ? `?${q}` : ''}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getTradeStats() {
  const r = await fetch(`${base}/trades/stats`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
