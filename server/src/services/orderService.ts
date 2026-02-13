import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc } from 'drizzle-orm';
import { getDatabase, getSqlite } from '../db/index.js';
import { deckRequests, deckLineItems, DeckRequest, DeckLineItem, NewDeckRequest, NewDeckLineItem, GameType, RequestStatus, NotifyMethod } from '../db/schema.js';
import { config } from '../config.js';

interface LineItemInput {
  quantity: number;
  cardName: string;
  parseConfidence?: number;
  lineRaw: string;
}

interface CreateOrderInput {
  customerName: string;
  email: string;
  phone?: string;
  notifyMethod?: NotifyMethod;
  game: GameType;
  format?: string;
  pickupWindow?: string;
  notes?: string;
  rawDecklist: string;
  lineItems: LineItemInput[];
}

function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars (0/O, 1/I)
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${config.orderPrefix}-${year}${month}${day}-${random}`;
}

export async function createOrder(input: CreateOrderInput): Promise<{ order: DeckRequest; lineItems: DeckLineItem[] }> {
  const db = getDatabase();
  const sqliteDb = getSqlite();

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const now = new Date().toISOString();
      const orderId = uuidv4();
      const orderNumber = generateOrderNumber();

      const result = sqliteDb.transaction(() => {
        // Insert order
        db.insert(deckRequests).values({
          id: orderId,
          orderNumber,
          customerName: input.customerName,
          email: input.email.toLowerCase(),
          phone: input.phone,
          notifyMethod: input.notifyMethod,
          game: input.game,
          format: input.format,
          pickupWindow: input.pickupWindow,
          notes: input.notes,
          rawDecklist: input.rawDecklist,
          status: 'submitted',
          createdAt: now,
          updatedAt: now,
        }).run();

        // Insert line items
        for (const item of input.lineItems) {
          const itemId = uuidv4();
          db.insert(deckLineItems).values({
            id: itemId,
            deckRequestId: orderId,
            quantity: item.quantity,
            cardName: item.cardName,
            parseConfidence: item.parseConfidence,
            lineRaw: item.lineRaw,
            createdAt: now,
          }).run();
        }

        // Fetch the created order and items within transaction
        const order = db.select().from(deckRequests).where(eq(deckRequests.id, orderId)).get()!;
        const items = db.select().from(deckLineItems).where(eq(deckLineItems.deckRequestId, orderId)).all();

        return { order, lineItems: items };
      })();

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('UNIQUE constraint') && attempt < MAX_RETRIES - 1) {
        continue; // Retry with new order number
      }
      throw err;
    }
  }
  throw new Error('Failed to generate unique order number');
}

export function getOrderByNumberAndEmail(orderNumber: string, email: string): DeckRequest | undefined {
  const db = getDatabase();
  return db.select()
    .from(deckRequests)
    .where(
      and(
        eq(deckRequests.orderNumber, orderNumber.toUpperCase()),
        eq(deckRequests.email, email.toLowerCase())
      )
    )
    .get();
}

export function getOrderLineItems(orderId: string, email: string): DeckLineItem[] {
  const db = getDatabase();

  // Verify order exists and email matches
  const order = db.select().from(deckRequests).where(eq(deckRequests.id, orderId)).get();
  if (!order || order.email.toLowerCase() !== email.toLowerCase()) {
    return [];
  }

  return db.select()
    .from(deckLineItems)
    .where(eq(deckLineItems.deckRequestId, orderId))
    .all();
}

interface GetOrdersOptions {
  limit?: number;
  offset?: number;
  status?: RequestStatus;
}

interface PaginatedOrders {
  orders: DeckRequest[];
  total: number;
  limit: number;
  offset: number;
}

export function getAllOrders(options: GetOrdersOptions = {}): PaginatedOrders {
  const sqliteDb = getSqlite();
  const db = getDatabase();
  const { limit = 50, offset = 0, status } = options;

  // Efficient count using raw SQL instead of fetching all rows
  const countRow = status
    ? sqliteDb.prepare('SELECT COUNT(*) as total FROM deck_requests WHERE status = ?').get(status) as { total: number }
    : sqliteDb.prepare('SELECT COUNT(*) as total FROM deck_requests').get() as { total: number };
  const total = countRow.total;

  // Get paginated results
  const orders = status
    ? db.select().from(deckRequests)
        .where(eq(deckRequests.status, status))
        .orderBy(desc(deckRequests.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    : db.select().from(deckRequests)
        .orderBy(desc(deckRequests.createdAt))
        .limit(limit)
        .offset(offset)
        .all();

  return { orders, total, limit, offset };
}

export function getOrderById(orderId: string): DeckRequest | undefined {
  const db = getDatabase();
  return db.select().from(deckRequests).where(eq(deckRequests.id, orderId)).get();
}

export function getOrderWithItems(orderId: string): { order: DeckRequest; lineItems: DeckLineItem[] } | undefined {
  const db = getDatabase();
  const order = db.select().from(deckRequests).where(eq(deckRequests.id, orderId)).get();
  if (!order) return undefined;

  const items = db.select().from(deckLineItems).where(eq(deckLineItems.deckRequestId, orderId)).all();
  return { order, lineItems: items };
}

interface UpdateOrderInput {
  status?: RequestStatus;
  staffNotes?: string;
  estimatedTotal?: number;
  missingItems?: string;
}

export function updateOrder(orderId: string, updates: UpdateOrderInput): DeckRequest | undefined {
  const db = getDatabase();
  const now = new Date().toISOString();

  const updateData: Partial<NewDeckRequest> = {
    updatedAt: now,
  };

  if (updates.status !== undefined) {
    updateData.status = updates.status;
    // Reset alert flags on status transitions
    if (updates.status === 'in_progress') {
      updateData.staleAlertSent = false;
    }
    if (updates.status === 'picked_up') {
      updateData.pickupAlertSent = false;
    }
  }
  if (updates.staffNotes !== undefined) updateData.staffNotes = updates.staffNotes;
  if (updates.estimatedTotal !== undefined) updateData.estimatedTotal = updates.estimatedTotal;
  if (updates.missingItems !== undefined) updateData.missingItems = updates.missingItems;

  db.update(deckRequests)
    .set(updateData)
    .where(eq(deckRequests.id, orderId))
    .run();

  return db.select().from(deckRequests).where(eq(deckRequests.id, orderId)).get();
}

interface UpdateLineItemInput {
  quantityFound?: number;
  unitPrice?: number;
  conditionVariants?: string;
  cardName?: string;
}

export function updateLineItem(itemId: string, updates: UpdateLineItemInput): DeckLineItem | undefined {
  const db = getDatabase();

  const updateData: Partial<NewDeckLineItem> = {};

  if (updates.quantityFound !== undefined) updateData.quantityFound = updates.quantityFound;
  if (updates.unitPrice !== undefined) updateData.unitPrice = updates.unitPrice;
  if (updates.conditionVariants !== undefined) updateData.conditionVariants = updates.conditionVariants;
  if (updates.cardName !== undefined) updateData.cardName = updates.cardName;

  db.update(deckLineItems)
    .set(updateData)
    .where(eq(deckLineItems.id, itemId))
    .run();

  return db.select().from(deckLineItems).where(eq(deckLineItems.id, itemId)).get();
}

export function deleteLineItem(itemId: string): boolean {
  const db = getDatabase();
  const result = db.delete(deckLineItems).where(eq(deckLineItems.id, itemId)).run();
  return result.changes > 0;
}

export function getLineItemById(itemId: string): DeckLineItem | undefined {
  const db = getDatabase();
  return db.select().from(deckLineItems).where(eq(deckLineItems.id, itemId)).get();
}

export function getLineItemsByOrderId(orderId: string): DeckLineItem[] {
  const db = getDatabase();
  return db.select().from(deckLineItems).where(eq(deckLineItems.deckRequestId, orderId)).all();
}
