import { config } from '../config.js';
import { sendDailyDigest, checkStaleOrders } from './discordService.js';

let lastDigestDate = '';
let lastStaleCheck = 0;

function getCurrentHourInTimezone(timezone: string): { hour: number; dateStr: string } {
  const now = new Date();
  const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return {
    hour: parseInt(hourFormatter.format(now), 10),
    dateStr: dateFormatter.format(now),
  };
}

async function tick() {
  if (!config.discord.webhookUrl) return;

  try {
    const { hour, dateStr } = getCurrentHourInTimezone(config.discord.timezone);

    // Daily digest: fire once per day at the configured hour
    if (hour === config.discord.dailyDigestHour && lastDigestDate !== dateStr) {
      lastDigestDate = dateStr;
      await sendDailyDigest();
    }

    // Stale order check: every 30 minutes
    const now = Date.now();
    if (now - lastStaleCheck >= 30 * 60 * 1000) {
      lastStaleCheck = now;
      await checkStaleOrders();
    }
  } catch (err) {
    console.error('Scheduler error:', err);
  }
}

export function startScheduler() {
  if (!config.discord.webhookUrl) {
    console.log('Discord webhook not configured — scheduler disabled');
    return;
  }

  console.log(`Scheduler started: daily digest at ${config.discord.dailyDigestHour}:00 ${config.discord.timezone}`);

  // Check every 60 seconds
  setInterval(tick, 60 * 1000);

  // Run stale check immediately on startup
  lastStaleCheck = Date.now();
  checkStaleOrders().catch(err => console.error('Initial stale check failed:', err));
}
