import { Router } from 'express';
import { getDb } from '../db/init.js';

export const tradesRouter = Router();

tradesRouter.get('/', (req, res) => {
  try {
    const { symbol, limit = 100 } = req.query;
    const db = getDb();
    let rows;
    if (symbol) {
      rows = db.prepare('SELECT * FROM trades WHERE symbol = ? ORDER BY created_at DESC LIMIT ?').all(symbol, Number(limit));
    } else {
      rows = db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?').all(Number(limit));
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

tradesRouter.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM trades WHERE pnl IS NOT NULL').all();
    const wins = rows.filter((r) => r.pnl > 0).length;
    const losses = rows.filter((r) => r.pnl < 0).length;
    const totalPnl = rows.reduce((s, r) => s + (r.pnl || 0), 0);
    const avgWin = wins ? rows.filter((r) => r.pnl > 0).reduce((s, r) => s + r.pnl, 0) / wins : 0;
    const avgLoss = losses ? rows.filter((r) => r.pnl < 0).reduce((s, r) => s + r.pnl, 0) / losses : 0;
    res.json({
      totalTrades: rows.length,
      wins,
      losses,
      winRate: rows.length ? (wins / rows.length) * 100 : 0,
      totalPnl,
      avgWin,
      avgLoss,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

tradesRouter.post('/', (req, res) => {
  try {
    const {
      symbol,
      side,
      quantity,
      entry_price,
      entry_time,
      stop_loss,
      take_profit,
      alpaca_order_id,
      timeframe,
    } = req.body;
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO trades (symbol, side, quantity, entry_price, entry_time, stop_loss, take_profit, alpaca_order_id, timeframe)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      symbol,
      side,
      quantity,
      entry_price ?? null,
      entry_time ?? null,
      stop_loss ?? null,
      take_profit ?? null,
      alpaca_order_id ?? null,
      timeframe ?? null
    );
    const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

tradesRouter.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { exit_price, exit_time, exit_reason, pnl } = req.body;
    const db = getDb();
    db.prepare(
      'UPDATE trades SET exit_price = ?, exit_time = ?, exit_reason = ?, pnl = ? WHERE id = ?'
    ).run(exit_price ?? null, exit_time ?? null, exit_reason ?? null, pnl ?? null, id);
    const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Trade not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
