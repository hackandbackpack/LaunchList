// Generate customer message for order pickup

import type { DeckLineItem, ConditionVariant } from './types';
import { CONFIG } from './config';

interface InventoryItem {
  quantityFound: number | null;
  unitPrice: number | null;
  conditionVariants: ConditionVariant[];
}

export interface ExportMessageParams {
  customerName: string;
  orderNumber: string;
  lineItems: DeckLineItem[];
  inventoryState: Map<string, InventoryItem>;
}

/**
 * Generate a customer-ready message summarizing the order
 */
export function generateCustomerMessage({
  customerName,
  orderNumber,
  lineItems,
  inventoryState,
}: ExportMessageParams): string {
  const foundItems: string[] = [];
  const missingItems: string[] = [];
  let totalPrice = 0;
  let totalFound = 0;

  for (const item of lineItems) {
    const inv = inventoryState.get(item.id);
    const qtyFound = inv?.quantityFound ?? null;

    if (qtyFound === null) {
      // Unchecked - skip or treat as missing
      continue;
    }

    if (qtyFound === 0) {
      missingItems.push(`${item.cardName} (out of stock)`);
      continue;
    }

    const missing = item.quantity - qtyFound;
    if (missing > 0) {
      missingItems.push(`${item.cardName} (requested ${item.quantity}, found ${qtyFound})`);
    }

    // Calculate line price
    let linePrice = 0;
    if (inv?.conditionVariants && inv.conditionVariants.length > 0) {
      linePrice = inv.conditionVariants.reduce((sum, v) => sum + (v.quantity * v.price), 0);
    } else if (inv?.unitPrice !== null && qtyFound > 0) {
      linePrice = inv.unitPrice * qtyFound;
    }

    if (linePrice > 0) {
      foundItems.push(`- ${qtyFound}x ${item.cardName} - $${linePrice.toFixed(2)}`);
      totalPrice += linePrice;
      totalFound += qtyFound;
    } else {
      foundItems.push(`- ${qtyFound}x ${item.cardName}`);
      totalFound += qtyFound;
    }
  }

  // Build message
  const lines: string[] = [];
  lines.push(`Hi ${customerName}!`);
  lines.push('');
  lines.push(`Your order ${orderNumber} is ready for pickup at ${CONFIG.store.name}.`);
  lines.push('');

  if (foundItems.length > 0) {
    lines.push(`WHAT WE FOUND (${totalFound} cards):`);
    lines.push(...foundItems);
    lines.push('');
  }

  if (missingItems.length > 0) {
    lines.push(`COULDN'T FIND:`);
    missingItems.forEach(m => lines.push(`- ${m}`));
    lines.push('');
  }

  if (totalPrice > 0) {
    lines.push(`ORDER TOTAL: $${totalPrice.toFixed(2)}`);
    lines.push('');
  }

  lines.push('See you soon!');

  return lines.join('\n');
}
