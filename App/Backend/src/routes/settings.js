import { Router } from 'express';
import { getSettings, updateSettings } from '../config/settings.js';
import { startScheduler } from '../services/scheduler.js';

export const settingsRouter = Router();

/**
 * GET /api/settings/openai-models
 * Lists OpenAI models the API key has access to (proxies GET https://api.openai.com/v1/models).
 */
settingsRouter.get('/openai-models', async (req, res) => {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return res.status(400).json({ error: 'OPENAI_API_KEY is not set' });
    }
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: text || r.statusText });
    }
    const data = await r.json();
    const models = (data.data || []).map((m) => ({ id: m.id, created: m.created, owned_by: m.owned_by })).sort((a, b) => (b.created || 0) - (a.created || 0));
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.get('/', (req, res) => {
  try {
    const settings = getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.put('/', (req, res) => {
  try {
    const updated = updateSettings(req.body);
    startScheduler();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
