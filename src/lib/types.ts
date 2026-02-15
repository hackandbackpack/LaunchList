export type GameType = 'magic' | 'onepiece' | 'pokemon' | 'other';
export type RequestStatus = 'submitted' | 'in_progress' | 'ready' | 'picked_up' | 'cancelled';
export type NotifyMethod = 'email' | 'sms';
export type AppRole = 'admin' | 'staff';

export interface DeckRequest {
  id: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  email: string;
  phone: string | null;
  notifyMethod: NotifyMethod;
  game: GameType;
  format: string | null;
  pickupWindow: string | null;
  notes: string | null;
  rawDecklist: string;
  status: RequestStatus;
  staffNotes: string | null;
  estimatedTotal: number | null;
  missingItems: string | null;
}

export interface ConditionVariant {
  condition: string;
  quantity: number;
  price: number;
}

export interface DeckLineItem {
  id: string;
  deckRequestId: string;
  quantity: number;
  cardName: string;
  parseConfidence: number | null;
  lineRaw: string;
  createdAt: string;
  quantityFound: number | null;
  unitPrice: number | null;
  conditionVariants: ConditionVariant[] | null;
}

export interface UserRole {
  id: string;
  userId: string;
  role: AppRole;
  createdAt: string;
}

export const GAME_LABELS: Record<GameType, string> = {
  magic: 'Magic: The Gathering',
  onepiece: 'One Piece TCG',
  pokemon: 'Pokémon',
  other: 'Other',
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: 'Submitted',
  in_progress: 'In Progress',
  ready: 'Ready for Pickup',
  picked_up: 'Picked Up',
  cancelled: 'Cancelled',
};

export const STATUS_ORDER: RequestStatus[] = ['submitted', 'in_progress', 'ready', 'picked_up'];
