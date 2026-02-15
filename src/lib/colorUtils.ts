// Color identity utilities for Magic: The Gathering card organization

import type { ScryfallCard } from './scryfall';
import type { DeckLineItem, ConditionVariant } from './types';

export type ColorGroup = 'W' | 'U' | 'B' | 'R' | 'G' | 'M' | 'C';

export interface ColorGroupInfo {
  key: ColorGroup;
  name: string;
  bgClass: string;
  textClass: string;
  order: number;
}

export const COLOR_GROUPS: Record<ColorGroup, ColorGroupInfo> = {
  W: { key: 'W', name: 'White', bgClass: 'bg-amber-50 dark:bg-amber-950/30', textClass: 'text-amber-700 dark:text-amber-300', order: 0 },
  U: { key: 'U', name: 'Blue', bgClass: 'bg-blue-50 dark:bg-blue-950/30', textClass: 'text-blue-700 dark:text-blue-300', order: 1 },
  B: { key: 'B', name: 'Black', bgClass: 'bg-zinc-100 dark:bg-zinc-900/50', textClass: 'text-zinc-700 dark:text-zinc-300', order: 2 },
  R: { key: 'R', name: 'Red', bgClass: 'bg-red-50 dark:bg-red-950/30', textClass: 'text-red-700 dark:text-red-300', order: 3 },
  G: { key: 'G', name: 'Green', bgClass: 'bg-green-50 dark:bg-green-950/30', textClass: 'text-green-700 dark:text-green-300', order: 4 },
  M: { key: 'M', name: 'Multicolor', bgClass: 'bg-gradient-to-r from-amber-50 via-purple-50 to-green-50 dark:from-amber-950/20 dark:via-purple-950/20 dark:to-green-950/20', textClass: 'text-purple-700 dark:text-purple-300', order: 5 },
  C: { key: 'C', name: 'Colorless', bgClass: 'bg-slate-50 dark:bg-slate-900/50', textClass: 'text-slate-600 dark:text-slate-400', order: 6 },
};

/**
 * Determine which color group a card belongs to based on its color identity
 */
export function getColorGroup(colorIdentity: string[]): ColorGroup {
  if (!colorIdentity || colorIdentity.length === 0) {
    return 'C'; // Colorless
  }
  if (colorIdentity.length > 1) {
    return 'M'; // Multicolor
  }
  const color = colorIdentity[0].toUpperCase();
  if (['W', 'U', 'B', 'R', 'G'].includes(color)) {
    return color as ColorGroup;
  }
  return 'C';
}

export interface CardWithColorData {
  item: DeckLineItem;
  colorGroup: ColorGroup;
  sortPrice: number; // For sorting within group (higher = first)
}

export interface InventoryItem {
  quantityFound: number | null;
  unitPrice: number | null;
  conditionVariants: ConditionVariant[];
}

/**
 * Group and sort line items by color identity and price
 */
export function groupCardsByColor(
  items: DeckLineItem[],
  cardDataMap: Map<string, { usd: string | null; card: ScryfallCard | null }>,
  inventoryState: Map<string, InventoryItem>
): Map<ColorGroup, CardWithColorData[]> {
  const groups = new Map<ColorGroup, CardWithColorData[]>();

  // Initialize all groups in order
  (['W', 'U', 'B', 'R', 'G', 'M', 'C'] as ColorGroup[]).forEach(group => {
    groups.set(group, []);
  });

  for (const item of items) {
    const cardData = cardDataMap.get(item.cardName.toLowerCase());
    const card = cardData?.card as ScryfallCard | null;
    const colorIdentity = card?.color_identity ?? [];
    const colorGroup = getColorGroup(colorIdentity);

    // Determine sort price: manual price first, then API price
    const inv = inventoryState.get(item.id);
    let sortPrice = 0;
    
    if (inv?.conditionVariants && inv.conditionVariants.length > 0) {
      // Use condition variant total
      sortPrice = inv.conditionVariants.reduce((sum, v) => sum + (v.quantity * v.price), 0);
    } else if (inv?.unitPrice !== null && inv?.unitPrice !== undefined) {
      sortPrice = inv.unitPrice * (inv.quantityFound ?? item.quantity);
    } else if (cardData?.usd) {
      sortPrice = parseFloat(cardData.usd) * item.quantity;
    }

    const existing = groups.get(colorGroup) ?? [];
    existing.push({ item, colorGroup, sortPrice });
    groups.set(colorGroup, existing);
  }

  // Sort each group by price descending
  groups.forEach((cards, group) => {
    cards.sort((a, b) => b.sortPrice - a.sortPrice);
    groups.set(group, cards);
  });

  return groups;
}

/**
 * Calculate subtotal for a color group
 */
export function calculateGroupSubtotal(
  cards: CardWithColorData[],
  inventoryState: Map<string, InventoryItem>
): number {
  return cards.reduce((total, { item }) => {
    const inv = inventoryState.get(item.id);
    if (!inv) return total;

    if (inv.conditionVariants && inv.conditionVariants.length > 0) {
      return total + inv.conditionVariants.reduce((sum, v) => sum + (v.quantity * v.price), 0);
    } else if (inv.unitPrice !== null && inv.quantityFound !== null && inv.quantityFound > 0) {
      return total + (inv.unitPrice * inv.quantityFound);
    }
    return total;
  }, 0);
}

/**
 * Get ordered color groups that have cards
 */
export function getPopulatedGroups(groups: Map<ColorGroup, CardWithColorData[]>): ColorGroup[] {
  return (['W', 'U', 'B', 'R', 'G', 'M', 'C'] as ColorGroup[]).filter(
    group => (groups.get(group)?.length ?? 0) > 0
  );
}
