import { useEffect, useState, useMemo, useCallback } from 'react';
import { Loader2, DollarSign, AlertCircle, Save, Package, PackageX, Copy, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EditableCardListItem } from './EditableCardListItem';
import {
  fetchCardPrices as fetchScryfallPrices,
  type ScryfallCard
} from '@/lib/scryfall';
import {
  fetchCardPrices as fetchPokemonPrices,
  type PokemonCard
} from '@/lib/pokemontcg';
import {
  groupCardsByColor,
  getPopulatedGroups,
  calculateGroupSubtotal,
  COLOR_GROUPS,
  type ColorGroup,
  type InventoryItem,
} from '@/lib/colorUtils';
import { generateCustomerMessage } from '@/lib/exportMessage';
import api from '@/integrations/api/client';
import type { DeckLineItem, GameType, ConditionVariant } from '@/lib/types';

// Union type for card data from different APIs
type CardData = ScryfallCard | PokemonCard;
type PriceMapEntry = { usd: string | null; card: CardData | null };

interface DeckCardListProps {
  lineItems: DeckLineItem[];
  game: GameType;
  deckRequestId: string;
  customerName?: string;
  orderNumber?: string;
  onItemUpdated?: () => void;
  onInventorySaved?: (estimatedTotal: number | null, missingItems: string | null) => void;
}

export function DeckCardList({ lineItems, game, deckRequestId, customerName, orderNumber, onItemUpdated, onInventorySaved }: DeckCardListProps) {
  const [priceMap, setPriceMap] = useState<Map<string, PriceMapEntry>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState(lineItems);
  const [inventoryState, setInventoryState] = useState<Map<string, InventoryItem>>(new Map());
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<ColorGroup>>(new Set(['W', 'U', 'B', 'R', 'G', 'M', 'C']));

  const isMagic = game === 'magic';
  const isPokemon = game === 'pokemon';
  const hasPricing = isMagic || isPokemon;
  const totalCards = localItems.reduce((sum, item) => sum + item.quantity, 0);

  // Initialize inventory state from line items
  useEffect(() => {
    const newState = new Map<string, InventoryItem>();
    lineItems.forEach(item => {
      // Parse conditionVariants from the database (it comes as JSON or null)
      let variants: ConditionVariant[] = [];
      if (item.conditionVariants) {
        try {
          variants = Array.isArray(item.conditionVariants)
            ? item.conditionVariants
            : JSON.parse(item.conditionVariants as unknown as string);
        } catch {
          variants = [];
        }
      }

      newState.set(item.id, {
        quantityFound: item.quantityFound,
        unitPrice: item.unitPrice,
        conditionVariants: variants,
      });
    });
    setInventoryState(newState);
    setLocalItems(lineItems);
  }, [lineItems]);

  // Fetch prices for Magic or Pokemon cards
  useEffect(() => {
    if (!hasPricing || localItems.length === 0) return;

    const abortController = new AbortController();
    const requestId = Date.now();

    const fetchPrices = async () => {
      setLoading(true);
      setError(null);

      try {
        const cardNames = localItems.map(item => item.cardName);

        let prices: Map<string, PriceMapEntry>;
        if (isMagic) {
          prices = await fetchScryfallPrices(cardNames);
        } else {
          prices = await fetchPokemonPrices(cardNames);
        }

        // Discard stale response
        if (abortController.signal.aborted) return;
        setPriceMap(prices);
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.error('Failed to fetch prices:', err);
        setError('Failed to load card prices');
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchPrices();
    return () => { abortController.abort(); };
  }, [localItems.length, isMagic, isPokemon, hasPricing]);

  // Calculate inventory summary
  const inventorySummary = useMemo(() => {
    let foundCards = 0;
    let missingCards = 0;
    let uncheckedCards = 0;
    let manualTotal = 0;
    let hasAnyPrice = false;
    const missingItemsList: string[] = [];

    localItems.forEach(item => {
      const inv = inventoryState.get(item.id);
      const qtyFound = inv?.quantityFound;
      const unitPrice = inv?.unitPrice;
      const variants = inv?.conditionVariants || [];

      if (qtyFound === null || qtyFound === undefined) {
        uncheckedCards += item.quantity;
      } else {
        foundCards += qtyFound;
        const missing = item.quantity - qtyFound;
        if (missing > 0) {
          missingCards += missing;
          if (qtyFound === 0) {
            missingItemsList.push(`${item.cardName} (0/${item.quantity})`);
          } else {
            missingItemsList.push(`${item.cardName} (${qtyFound}/${item.quantity})`);
          }
        }

        // Calculate total from condition variants OR unit price
        if (variants.length > 0) {
          const variantTotal = variants.reduce((sum, v) => sum + (v.quantity * v.price), 0);
          if (variantTotal > 0) {
            manualTotal += variantTotal;
            hasAnyPrice = true;
          }
        } else if (unitPrice !== null && unitPrice !== undefined && qtyFound > 0) {
          manualTotal += unitPrice * qtyFound;
          hasAnyPrice = true;
        }
      }
    });

    return {
      foundCards,
      missingCards,
      uncheckedCards,
      manualTotal,
      hasAnyPrice,
      missingItemsList,
    };
  }, [localItems, inventoryState]);

  const handleSaveCard = async (itemId: string, newCardName: string) => {
    try {
      await api.staff.updateLineItem(deckRequestId, itemId, { cardName: newCardName });

      // Update local state immediately
      setLocalItems(prev =>
        prev.map(item =>
          item.id === itemId ? { ...item, cardName: newCardName } : item
        )
      );

      toast.success('Card name updated');
      onItemUpdated?.();
    } catch {
      toast.error('Failed to update card name');
      throw new Error('Failed to update card name');
    }
  };

  const handleQuantityFoundChange = useCallback((itemId: string, value: number | null) => {
    setInventoryState(prev => {
      const newState = new Map(prev);
      const current = newState.get(itemId) || { quantityFound: null, unitPrice: null, conditionVariants: [] };
      newState.set(itemId, { ...current, quantityFound: value });
      return newState;
    });
  }, []);

  const handleUnitPriceChange = useCallback((itemId: string, value: number | null) => {
    setInventoryState(prev => {
      const newState = new Map(prev);
      const current = newState.get(itemId) || { quantityFound: null, unitPrice: null, conditionVariants: [] };
      newState.set(itemId, { ...current, unitPrice: value });
      return newState;
    });
  }, []);

  const handleConditionVariantsChange = useCallback((itemId: string, variants: ConditionVariant[]) => {
    setInventoryState(prev => {
      const newState = new Map(prev);
      const current = newState.get(itemId) || { quantityFound: null, unitPrice: null, conditionVariants: [] };
      newState.set(itemId, { ...current, conditionVariants: variants });
      return newState;
    });
  }, []);

  const handleSaveInventory = async () => {
    setSaving(true);

    try {
      // Build update requests for all items
      const updates = localItems.map(item => {
        const inv = inventoryState.get(item.id);
        const variants = inv?.conditionVariants || [];
        return {
          id: item.id,
          promise: api.staff.updateLineItem(deckRequestId, item.id, {
            quantityFound: inv?.quantityFound ?? undefined,
            unitPrice: inv?.unitPrice ?? undefined,
            conditionVariants: variants.length > 0 ? JSON.stringify(variants) : undefined,
          }),
        };
      });

      const results = await Promise.allSettled(updates.map(u => u.promise));

      const failures = results.filter(r => r.status === 'rejected');

      if (failures.length === 0) {
        // Calculate totals for the deck_requests table
        const estimatedTotal = inventorySummary.hasAnyPrice ? inventorySummary.manualTotal : undefined;
        const missingItems = inventorySummary.missingItemsList.length > 0
          ? inventorySummary.missingItemsList.join(', ')
          : undefined;

        await api.staff.updateOrder(deckRequestId, {
          estimatedTotal,
          missingItems,
        });

        toast.success(`Saved ${updates.length} card${updates.length === 1 ? '' : 's'}`);
        onInventorySaved?.(estimatedTotal ?? null, missingItems ?? null);
      } else if (failures.length === updates.length) {
        toast.error('Failed to save all changes. Check your connection and try again.');
      } else {
        const savedCount = updates.length - failures.length;
        toast.warning(`Saved ${savedCount} cards, but ${failures.length} failed. Try saving again.`);
        onInventorySaved?.(null, null);
      }
    } catch (err) {
      console.error('Failed to save inventory:', err);
      toast.error('Unexpected error saving inventory');
    } finally {
      setSaving(false);
    }
  };

  // Group cards by color for Magic
  const colorGroups = useMemo(() => {
    if (!isMagic) return null;
    return groupCardsByColor(
      localItems,
      priceMap as Map<string, { usd: string | null; card: ScryfallCard | null }>,
      inventoryState
    );
  }, [isMagic, localItems, priceMap, inventoryState]);

  const populatedGroups = useMemo(() => {
    if (!colorGroups) return [];
    return getPopulatedGroups(colorGroups);
  }, [colorGroups]);

  const toggleGroup = (group: ColorGroup) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const handleCopyCustomerMessage = async () => {
    const message = generateCustomerMessage({
      customerName: customerName || 'Customer',
      orderNumber: orderNumber || 'N/A',
      lineItems: localItems,
      inventoryState,
    });

    try {
      await navigator.clipboard.writeText(message);
      toast.success('Customer message copied to clipboard!');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  // Render a single card item (memoized to prevent unnecessary re-renders)
  const renderCardItem = useCallback((item: DeckLineItem) => {
    const cardPriceData = priceMap.get(item.cardName.toLowerCase());
    const inv = inventoryState.get(item.id);
    return (
      <EditableCardListItem
        key={item.id}
        id={item.id}
        cardName={item.cardName}
        quantity={item.quantity}
        game={game}
        cardData={cardPriceData?.card}
        priceLoading={loading}
        quantityFound={inv?.quantityFound ?? null}
        unitPrice={inv?.unitPrice ?? null}
        conditionVariants={inv?.conditionVariants ?? []}
        onSave={handleSaveCard}
        onQuantityFoundChange={handleQuantityFoundChange}
        onUnitPriceChange={handleUnitPriceChange}
        onConditionVariantsChange={handleConditionVariantsChange}
      />
    );
  }, [priceMap, inventoryState, loading, game, handleSaveCard, handleQuantityFoundChange, handleUnitPriceChange, handleConditionVariantsChange]);

  return (
    <Card className="glow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            Cards
            <span className="text-sm font-normal text-muted-foreground">
              ({totalCards} requested)
            </span>
          </CardTitle>

          <div className="flex gap-2">
            <Button
              onClick={handleCopyCustomerMessage}
              variant="outline"
              size="sm"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Customer Message
            </Button>
            <Button
              onClick={handleSaveInventory}
              disabled={saving || loading}
              title={loading ? 'Waiting for price data...' : undefined}
              variant="default"
              size="sm"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
              ) : loading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading prices...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" /> Save Inventory</>
              )}
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1.5">
            <Package className="h-4 w-4 text-green-500" />
            <span className="text-muted-foreground">Found:</span>
            <span className="font-medium">{inventorySummary.foundCards}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <PackageX className="h-4 w-4 text-destructive" />
            <span className="text-muted-foreground">Missing:</span>
            <span className="font-medium">{inventorySummary.missingCards}</span>
          </div>
          {inventorySummary.uncheckedCards > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>Unchecked:</span>
              <span className="font-medium">{inventorySummary.uncheckedCards}</span>
            </div>
          )}
          {inventorySummary.hasAnyPrice && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">Total:</span>
              <span className="font-mono font-semibold text-green-500">
                ${inventorySummary.manualTotal.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* API Price Loading Status */}
        {hasPricing && (
          <div className="mt-2">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading API reference prices...
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {error}
              </div>
            ) : null}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {/* Column Headers - hidden on mobile since rows wrap */}
        <div className="hidden sm:flex items-center gap-2 py-2 px-3 text-xs text-muted-foreground border-b border-border mb-2">
          <div className="w-4" /> {/* Status icon */}
          <div className="w-8">Qty</div>
          <div className="flex-1">Card Name</div>
          <div className="w-7" /> {/* Edit button */}
          <div className="w-20 text-center">Found</div>
          <div className="w-20 text-center">Price</div>
          <div className="w-20 text-right">Line Total</div>
        </div>

        {localItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No cards in this request
          </div>
        ) : isMagic && colorGroups && populatedGroups.length > 0 ? (
          // Magic: Render by color groups
          <div className="max-h-[600px] overflow-y-auto -mx-2 px-2 space-y-2">
            {populatedGroups.map(groupKey => {
              const group = COLOR_GROUPS[groupKey];
              const cards = colorGroups.get(groupKey) || [];
              const cardCount = cards.reduce((sum, c) => sum + c.item.quantity, 0);
              const subtotal = calculateGroupSubtotal(cards, inventoryState);
              const isOpen = openGroups.has(groupKey);

              return (
                <Collapsible key={groupKey} open={isOpen} onOpenChange={() => toggleGroup(groupKey)}>
                  <CollapsibleTrigger className={`w-full flex items-center justify-between px-3 py-2 rounded-lg ${group.bgClass} hover:opacity-90 transition-opacity`}>
                    <div className="flex items-center gap-2">
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                      <span className={`font-medium ${group.textClass}`}>{group.name}</span>
                      <span className="text-xs text-muted-foreground">({cardCount} cards)</span>
                    </div>
                    {subtotal > 0 && (
                      <span className="text-sm font-mono text-green-600 dark:text-green-400">
                        ${subtotal.toFixed(2)}
                      </span>
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-0.5 mt-1">
                    {cards.map(({ item }) => renderCardItem(item))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        ) : (
          // Non-Magic: Render flat list
          <div className="max-h-[500px] overflow-y-auto -mx-2 px-2 space-y-0.5">
            {localItems.map(item => renderCardItem(item))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
