import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { settingsRouter } from './routes/settings.js';
import { tradesRouter } from './routes/trades.js';
import { scanRouter } from './routes/scan.js';
import { assetsRouter } from './routes/assets.js';
import { initDb } from './db/init.js';
import { startScheduler } from './services/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

initDb();
startScheduler();

app.use('/api/settings', settingsRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/scan', scanRouter);
app.use('/api/assets', assetsRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
