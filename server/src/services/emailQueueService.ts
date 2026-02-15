import { getDatabase, getSqlite } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sendConfirmationEmail, sendReadyEmail } from './emailService.js';
import { getOrderWithItems } from './orderService.js';

const MAX_ATTEMPTS = 3;

let processing = false;

export function enqueueEmail(orderId: string, recipient: string, template: 'confirmation' | 'ready') {
  const db = getDatabase();
  db.insert(schema.emailQueue).values({ orderId, recipient, template }).run();
}

export async function processEmailQueue() {
  if (processing) return;
  processing = true;

  try {
    const db = getDatabase();
    const pending = db.select().from(schema.emailQueue)
      .where(eq(schema.emailQueue.status, 'pending'))
      .all();

    for (const entry of pending) {
      await processEmail(entry);
    }
  } finally {
    processing = false;
  }
}

async function processEmail(entry: typeof schema.emailQueue.$inferSelect) {
  const db = getDatabase();
  try {
    const result = getOrderWithItems(String(entry.orderId));
    if (!result) throw new Error(`Order ${entry.orderId} not found`);

    const { order, lineItems } = result;

    let sent = false;
    if (entry.template === 'confirmation') {
      sent = await sendConfirmationEmail(order, lineItems);
    } else if (entry.template === 'ready') {
      sent = await sendReadyEmail(order, lineItems);
    }
    if (!sent) {
      throw new Error('Email delivery failed or SMTP not configured');
    }

    db.update(schema.emailQueue)
      .set({ status: 'sent', sentAt: new Date().toISOString() })
      .where(eq(schema.emailQueue.id, entry.id))
      .run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = entry.attempts + 1;
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    db.update(schema.emailQueue)
      .set({ attempts, lastError: message, status })
      .where(eq(schema.emailQueue.id, entry.id))
      .run();
  }
}

export function cleanupOldEmails() {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  getSqlite().prepare(
    `DELETE FROM email_queue WHERE status IN ('sent', 'failed') AND created_at < ?`
  ).run(cutoff);
}

export function startEmailProcessor() {
  setInterval(processEmailQueue, 30_000); // Every 30 seconds
}
