import cron from 'node-cron';
import { getSettings } from '../config/settings.js';
import { runScan } from './scan.js';
import { getClock } from './alpaca.js';

let scheduledTask = null;

export function startScheduler() {
  const settings = getSettings();
  if (settings.schedulerEnabled === false) {
    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
    }
    console.log('Scheduler disabled (automatic scan off). Enable in Settings to run scans on a schedule.');
    return;
  }
  const cronExpr = settings.scanFrequencyCron || '*/15 * * * *';
  if (!cron.validate(cronExpr)) {
    console.warn('Invalid cron expression, using */15 * * * *');
  }
  const expr = cron.validate(cronExpr) ? cronExpr : '*/15 * * * *';
  if (scheduledTask) {
    scheduledTask.stop();
  }
  scheduledTask = cron.schedule(expr, async () => {
    try {
      const clock = await getClock();
      if (!clock.is_open) {
        console.log('Market closed, skipping scheduled scan');
        return;
      }
      const currentSettings = getSettings();
      if (currentSettings.schedulerEnabled === false) return;
      console.log('Running scheduled scan...');
      await runScan(currentSettings);
      console.log('Scheduled scan done');
    } catch (err) {
      console.error('Scheduled scan error:', err.message);
    }
  });
  console.log('Scheduler started with cron:', expr);
}

export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}
