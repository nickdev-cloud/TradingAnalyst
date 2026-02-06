import { Router } from 'express';
import { searchAssets } from '../services/alpaca.js';

export const assetsRouter = Router();

/**
 * GET /api/assets/search?q=aapl
 * Returns Alpaca assets matching the query (symbol or name). Used by Settings asset picker.
 */
assetsRouter.get('/search', async (req, res) => {
  try {
    const q = req.query.q;
    const results = await searchAssets(q);
    res.json(results);
  } catch (err) {
    console.error('Assets search error:', err.message);
    const status = err.message && err.message.includes('Alpaca') ? 502 : 500;
    res.status(status).json({ error: err.message || 'Search unavailable' });
  }
});
