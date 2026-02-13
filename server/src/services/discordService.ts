import { config } from '../config.js';
import { getSqlite } from '../db/index.js';

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
}

const COLORS = {
  green: 0x22c55e,
  yellow: 0xeab308,
  red: 0xef4444,
};

async function sendWebhook(embeds: DiscordEmbed[]) {
  const url = config.discord.webhookUrl;
  if (!url) return;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds }),
      });
      if (res.ok) return;
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
      console.error(`Discord webhook failed: ${res.status} ${res.statusText}`);
      return;
    } catch (err) {
      console.error('Discord webhook error:', err);
      if (attempt === 0) continue;
    }
  }
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function sendDailyDigest() {
  if (!config.discord.webhookUrl) return;

  const sqlite = getSqlite();

  const counts = {
    submitted: (sqlite.prepare(`SELECT COUNT(*) as c FROM deck_requests WHERE status = 'submitted'`).get() as { c: number }).c,
    inProgress: (sqlite.prepare(`SELECT COUNT(*) as c FROM deck_requests WHERE status = 'in_progress'`).get() as { c: number }).c,
    ready: (sqlite.prepare(`SELECT COUNT(*) as c FROM deck_requests WHERE status = 'ready'`).get() as { c: number }).c,
  };

  const staleHours = config.discord.staleOrderHours;
  const staleOrders = sqlite.prepare(`
    SELECT order_number, customer_name, game, created_at
    FROM deck_requests
    WHERE status = 'submitted'
    AND created_at < datetime('now', ?)
    ORDER BY created_at ASC
  `).all(`-${staleHours} hours`) as { order_number: string; customer_name: string; game: string; created_at: string }[];

  const holdDays = config.orderHoldDays;
  const stalePickups = sqlite.prepare(`
    SELECT order_number, customer_name, game, email, phone, updated_at
    FROM deck_requests
    WHERE status = 'ready'
    AND updated_at < datetime('now', ?)
    ORDER BY updated_at ASC
  `).all(`-${holdDays} days`) as { order_number: string; customer_name: string; game: string; email: string; phone: string | null; updated_at: string }[];

  const total = counts.submitted + counts.inProgress + counts.ready;
  if (total === 0 && staleOrders.length === 0 && stalePickups.length === 0) {
    await sendWebhook([{
      title: 'ListPull Daily Digest',
      description: 'No pending orders — all caught up!',
      color: COLORS.green,
      timestamp: new Date().toISOString(),
    }]);
    return;
  }

  let color = COLORS.yellow;
  if (staleOrders.length > 0 || stalePickups.length > 0) color = COLORS.red;

  const fields: DiscordEmbed['fields'] = [
    { name: 'Waiting to be worked', value: String(counts.submitted), inline: true },
    { name: 'In progress', value: String(counts.inProgress), inline: true },
    { name: 'Ready for pickup', value: String(counts.ready), inline: true },
  ];

  if (staleOrders.length > 0) {
    const lines = staleOrders.map(o =>
      `• **${o.order_number}** — "${o.customer_name}" — ${o.game} (submitted ${formatTimeAgo(o.created_at)})`
    ).join('\n');
    fields.push({
      name: `⚠️ ${staleOrders.length} order${staleOrders.length === 1 ? '' : 's'} over ${staleHours} hours old`,
      value: lines.substring(0, 1024),
    });
  }

  if (stalePickups.length > 0) {
    const lines = stalePickups.map(o => {
      const contact = o.phone
        ? `${o.email} / ${o.phone}`
        : o.email;
      return `• **${o.order_number}** — "${o.customer_name}" — ${o.game} (ready since ${formatDate(o.updated_at)})\n  Contact: ${contact}`;
    }).join('\n');
    fields.push({
      name: `📦 ${stalePickups.length} order${stalePickups.length === 1 ? '' : 's'} waiting for pickup over ${holdDays} days`,
      value: lines.substring(0, 1024),
    });
  }

  await sendWebhook([{
    title: `ListPull Daily Digest — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    description: `${total} total active order${total === 1 ? '' : 's'}`,
    color,
    fields,
    timestamp: new Date().toISOString(),
  }]);
}

export async function checkStaleOrders() {
  if (!config.discord.webhookUrl) return;

  const sqlite = getSqlite();
  const staleHours = config.discord.staleOrderHours;

  // Stale submitted orders (not yet alerted)
  const staleOrders = sqlite.prepare(`
    SELECT id, order_number, customer_name, email, phone, game, created_at
    FROM deck_requests
    WHERE status = 'submitted'
    AND stale_alert_sent = 0
    AND created_at < datetime('now', ?)
  `).all(`-${staleHours} hours`) as { id: string; order_number: string; customer_name: string; email: string; phone: string | null; game: string; created_at: string }[];

  for (const order of staleOrders) {
    const itemCount = (sqlite.prepare(
      `SELECT COUNT(*) as c FROM deck_line_items WHERE deck_request_id = ?`
    ).get(order.id) as { c: number }).c;

    await sendWebhook([{
      title: `🚨 Order ${order.order_number} has been waiting over ${staleHours} hours`,
      description: '',
      color: COLORS.red,
      fields: [
        { name: 'Customer', value: order.customer_name, inline: true },
        { name: 'Game', value: order.game, inline: true },
        { name: 'Cards', value: `${itemCount} items`, inline: true },
        { name: 'Submitted', value: formatTimeAgo(order.created_at) },
        { name: 'Contact', value: order.phone ? `${order.email} / ${order.phone}` : order.email },
      ],
      timestamp: new Date().toISOString(),
    }]);

    // Mark as alerted
    sqlite.prepare(`UPDATE deck_requests SET stale_alert_sent = 1 WHERE id = ?`).run(order.id);
  }

  // Stale pickups (not yet alerted)
  const holdDays = config.orderHoldDays;
  const stalePickups = sqlite.prepare(`
    SELECT id, order_number, customer_name, email, phone, game, updated_at
    FROM deck_requests
    WHERE status = 'ready'
    AND pickup_alert_sent = 0
    AND updated_at < datetime('now', ?)
  `).all(`-${holdDays} days`) as { id: string; order_number: string; customer_name: string; email: string; phone: string | null; game: string; updated_at: string }[];

  for (const order of stalePickups) {
    await sendWebhook([{
      title: `📦 Order ${order.order_number} waiting for pickup over ${holdDays} days`,
      description: '',
      color: COLORS.red,
      fields: [
        { name: 'Customer', value: order.customer_name, inline: true },
        { name: 'Game', value: order.game, inline: true },
        { name: 'Ready since', value: formatDate(order.updated_at), inline: true },
        { name: 'Contact', value: order.phone ? `${order.email} / ${order.phone}` : order.email },
      ],
      timestamp: new Date().toISOString(),
    }]);

    sqlite.prepare(`UPDATE deck_requests SET pickup_alert_sent = 1 WHERE id = ?`).run(order.id);
  }
}
