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

// Deck request (order)
export interface DeckRequest {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string | null;
  notifyMethod: NotifyMethod | null;
  game: GameType;
  format: string | null;
  pickupWindow: string | null;
  notes: string | null;
  rawDecklist: string;
  status: RequestStatus;
  staffNotes: string | null;
  estimatedTotal: number | null;
  missingItems: string | null;
  createdAt: string;
  updatedAt: string;
}

// Deck line item
export interface DeckLineItem {
  id: string;
  deckRequestId: string;
  quantity: number;
  cardName: string;
  parseConfidence: number | null;
  lineRaw: string;
  quantityFound: number | null;
  unitPrice: number | null;
  conditionVariants: string | null;
  createdAt: string;
}

// Condition variant structure
export interface ConditionVariant {
  condition: string;
  quantity: number;
  price: number;
}

// Auth user
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

// Staff user (returned by admin endpoints)
export interface StaffUser {
  id: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
  createdAt: string;
  createdBy?: string | null;
}

export interface StaffUsersListResponse {
  users: StaffUser[];
}

export interface CreateUserInput {
  email: string;
  password: string;
  role?: UserRole;
}

export interface CreateUserResponse {
  user: StaffUser;
}

// API Response types
export interface LoginResponse {
  token: string;
  user: AuthUser;
  mustChangePassword: boolean;
}

export interface SessionResponse {
  user: AuthUser;
}

export interface OrderSubmitResponse {
  orderNumber: string;
  order: DeckRequest;
  lineItems: DeckLineItem[];
}

export interface OrderLookupResponse {
  order: DeckRequest;
}

export interface OrderLineItemsResponse {
  lineItems: DeckLineItem[];
}

export interface OrderWithItemsResponse {
  order: DeckRequest;
  lineItems: DeckLineItem[];
}

export interface OrdersListResponse {
  orders: DeckRequest[];
  total: number;
  limit: number;
  offset: number;
}

export interface GetOrdersParams {
  limit?: number;
  offset?: number;
  status?: RequestStatus;
}

export interface UpdateOrderResponse {
  order: DeckRequest;
}

export interface UpdateLineItemResponse {
  lineItem: DeckLineItem;
}

export interface PokemonTcgCard {
  id: string;
  name: string;
  set_name: string | null;
  set_id: string | null;
  rarity: string | null;
  image_url: string | null;
}

export interface PokemonTcgResponse {
  cards: PokemonTcgCard[];
}

// Input types
export interface LineItemInput {
  quantity: number;
  cardName: string;
  parseConfidence?: number;
  lineRaw: string;
}

export interface SubmitOrderInput {
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

export interface UpdateOrderInput {
  status?: RequestStatus;
  staffNotes?: string;
  estimatedTotal?: number;
  missingItems?: string;
}

export interface UpdateLineItemInput {
  quantityFound?: number;
  unitPrice?: number;
  conditionVariants?: string;
  cardName?: string;
}
