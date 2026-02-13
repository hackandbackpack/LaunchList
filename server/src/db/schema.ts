import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Game types
export const gameTypes = ['magic', 'onepiece', 'pokemon', 'other'] as const;
export type GameType = (typeof gameTypes)[number];

// Request statuses
export const requestStatuses = ['submitted', 'in_progress', 'ready', 'picked_up', 'cancelled'] as const;
export type RequestStatus = (typeof requestStatuses)[number];

// Notification methods
export const notifyMethods = ['email', 'sms'] as const;
export type NotifyMethod = (typeof notifyMethods)[number];

// User roles
export const userRoles = ['admin', 'staff'] as const;
export type UserRole = (typeof userRoles)[number];

// Deck requests table
export const deckRequests = sqliteTable('deck_requests', {
  id: text('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  customerName: text('customer_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  notifyMethod: text('notify_method').$type<NotifyMethod>(),
  game: text('game').$type<GameType>().notNull(),
  format: text('format'),
  pickupWindow: text('pickup_window'),
  notes: text('notes'),
  rawDecklist: text('raw_decklist').notNull(),
  status: text('status').$type<RequestStatus>().notNull().default('submitted'),
  staffNotes: text('staff_notes'),
  estimatedTotal: real('estimated_total'),
  missingItems: text('missing_items'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type DeckRequest = typeof deckRequests.$inferSelect;
export type NewDeckRequest = typeof deckRequests.$inferInsert;

// Deck line items table
export const deckLineItems = sqliteTable('deck_line_items', {
  id: text('id').primaryKey(),
  deckRequestId: text('deck_request_id').notNull().references(() => deckRequests.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
  cardName: text('card_name').notNull(),
  parseConfidence: real('parse_confidence'),
  lineRaw: text('line_raw').notNull(),
  quantityFound: integer('quantity_found'),
  unitPrice: real('unit_price'),
  conditionVariants: text('condition_variants'), // JSON string
  createdAt: text('created_at').notNull(),
});

export type DeckLineItem = typeof deckLineItems.$inferSelect;
export type NewDeckLineItem = typeof deckLineItems.$inferInsert;

// Users table (for staff/admin)
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<UserRole>().notNull().default('staff'),
  createdAt: text('created_at').notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Token blacklist for logout
export const tokenBlacklist = sqliteTable('token_blacklist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token: text('token').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Audit log
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  details: text('details'),
  ipAddress: text('ip_address'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Parsed condition variant structure
export interface ConditionVariant {
  condition: string;
  quantity: number;
  price: number;
}
