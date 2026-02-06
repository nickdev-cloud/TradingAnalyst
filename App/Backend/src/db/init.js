import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'trading.db');

let db = null;

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDb() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      entry_price REAL,
      entry_time TEXT,
      stop_loss REAL,
      take_profit REAL,
      exit_price REAL,
      exit_time TEXT,
      exit_reason TEXT,
      pnl REAL,
      alpaca_order_id TEXT,
      timeframe TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      side TEXT NOT NULL,
      confidence REAL,
      suggested_size REAL,
      stop_loss REAL,
      take_profit REAL,
      raw_response TEXT,
      rsi REAL,
      scanned_at TEXT DEFAULT (datetime('now'))
    );
  `);
  try {
    database.exec('ALTER TABLE candidates ADD COLUMN rsi REAL');
  } catch (_) {}
  try {
    database.exec('ALTER TABLE candidates ADD COLUMN bravo9_signal TEXT');
  } catch (_) {}
  try {
    database.exec('ALTER TABLE candidates ADD COLUMN bravo9 TEXT');
  } catch (_) {}
  try {
    database.exec('ALTER TABLE candidates ADD COLUMN current_price REAL');
  } catch (_) {}
  try {
    database.exec('ALTER TABLE candidates ADD COLUMN trend_signal TEXT');
  } catch (_) {}
  try {
    database.exec('ALTER TABLE candidates ADD COLUMN trend_200 TEXT');
  } catch (_) {}
  try {
    database.exec('ALTER TABLE candidates ADD COLUMN macd_signal TEXT');
  } catch (_) {}
  try {
    database.exec('ALTER TABLE candidates ADD COLUMN momentum_prediction TEXT');
  } catch (_) {}
  // Clear trades on startup so the app only shows trades from this session
  database.prepare('DELETE FROM trades').run();
  return database;
}
