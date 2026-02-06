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
    let wins = 0;
    let losses = 0;
    let totalPnl = 0;
    let winSum = 0;
    let lossSum = 0;
    for (const r of rows) {
      const pnl = r.pnl || 0;
      totalPnl += pnl;
      if (r.pnl > 0) { wins++; winSum += r.pnl; }
      else if (r.pnl < 0) { losses++; lossSum += r.pnl; }
    }
    res.json({
      totalTrades: rows.length,
      wins,
      losses,
      winRate: rows.length ? (wins / rows.length) * 100 : 0,
      totalPnl,
      avgWin: wins ? winSum / wins : 0,
      avgLoss: losses ? lossSum / losses : 0,
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
