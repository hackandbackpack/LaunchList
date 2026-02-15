import { useState, useRef, useEffect } from 'react';
import { ExternalLink, Loader2, ImageOff, Check, X, Pencil, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { 
  getScryfallCardUrl, 
  autocompleteCardName as scryfallAutocomplete, 
  type ScryfallCard 
} from '@/lib/scryfall';
import { 
  getPokemonCardUrl, 
  autocompleteCardName as pokemonAutocomplete,
  type PokemonCard 
} from '@/lib/pokemontcg';
import { cn } from '@/lib/utils';
import type { GameType, ConditionVariant } from '@/lib/types';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConditionBreakdown } from './ConditionBreakdown';

// Union type for card data
type CardData = ScryfallCard | PokemonCard;

// Type guards
function isScryfallCard(card: CardData): card is ScryfallCard {
  return 'scryfall_uri' in card || 'prices' in card;
}

function isPokemonCard(card: CardData): card is PokemonCard {
  return 'images' in card && 'set' in card && !('scryfall_uri' in card);
}

interface EditableCardListItemProps {
  id: string;
  cardName: string;
  quantity: number;
  game: GameType;
  cardData?: CardData | null;
  priceLoading?: boolean;
  quantityFound: number | null;
  unitPrice: number | null;
  conditionVariants: ConditionVariant[];
  onSave: (id: string, newCardName: string) => Promise<void>;
  onQuantityFoundChange: (id: string, value: number | null) => void;
  onUnitPriceChange: (id: string, value: number | null) => void;
  onConditionVariantsChange: (id: string, variants: ConditionVariant[]) => void;
}

export function EditableCardListItem({
  id,
  cardName,
  quantity,
  game,
  cardData,
  priceLoading,
  quantityFound,
  unitPrice,
  conditionVariants,
  onSave,
  onQuantityFoundChange,
  onUnitPriceChange,
  onConditionVariantsChange,
}: EditableCardListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(cardName);
  const [isSaving, setIsSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [imageError, setImageError] = useState(false);
  const [localPriceInput, setLocalPriceInput] = useState(unitPrice?.toString() ?? '');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const isMagic = game === 'magic';
  const isPokemon = game === 'pokemon';
  const hasPricing = isMagic || isPokemon;
  
  // Get card URL based on game
  const cardUrl = isMagic 
    ? getScryfallCardUrl(cardName) 
    : isPokemon 
      ? getPokemonCardUrl(cardName, (cardData && isPokemonCard(cardData)) ? cardData : null)
      : null;

  // Get API reference price from card data
  const getApiPrice = (): string | null => {
    if (!cardData) return null;
    if (isScryfallCard(cardData)) {
      return cardData.prices?.usd ?? null;
    }
    return null;
  };

  // Get image URL from card data
  const getImageUrl = (): string | null => {
    if (!cardData) return null;
    if (isScryfallCard(cardData)) {
      return cardData.image_uris?.normal || cardData.image_uris?.small || null;
    }
    if (isPokemonCard(cardData)) {
      return cardData.images?.large || cardData.images?.small || null;
    }
    return null;
  };

  // Get card set info
  const getSetInfo = (): { name: string; rarity?: string } | null => {
    if (!cardData) return null;
    if (isScryfallCard(cardData)) {
      return { name: cardData.set_name, rarity: cardData.rarity };
    }
    if (isPokemonCard(cardData)) {
      return { name: cardData.set.name, rarity: cardData.rarity };
    }
    return null;
  };

  const apiPrice = getApiPrice();
  const imageUrl = getImageUrl();
  const setInfo = getSetInfo();
  const isNotFound = cardData === null && !priceLoading && hasPricing;

  // Calculate line total from condition variants OR manual price
  const hasConditionVariants = conditionVariants.length > 0;
  const conditionTotal = conditionVariants.reduce((sum, v) => sum + (v.quantity * v.price), 0);
  const simpleTotal = unitPrice !== null && quantityFound !== null && quantityFound > 0
    ? unitPrice * quantityFound
    : null;
  const lineTotal = hasConditionVariants ? conditionTotal : simpleTotal;
  const lineTotalFormatted = lineTotal !== null && lineTotal > 0 ? lineTotal.toFixed(2) : null;

  // Sync local price input when unitPrice prop changes externally
  useEffect(() => {
    setLocalPriceInput(unitPrice?.toString() ?? '');
  }, [unitPrice]);

  // Get inventory status
  const getInventoryStatus = () => {
    if (quantityFound === null) return 'unchecked';
    if (quantityFound === 0) return 'none';
    if (quantityFound < quantity) return 'partial';
    return 'full';
  };

  const inventoryStatus = getInventoryStatus();

  const StatusIcon = () => {
    switch (inventoryStatus) {
      case 'full':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'partial':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'none':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing || !hasPricing) return;
    
    const fetchSuggestions = async () => {
      if (editValue.length < 2) {
        setSuggestions([]);
        return;
      }
      
      const autocompleteFn = isMagic ? scryfallAutocomplete : pokemonAutocomplete;
      const results = await autocompleteFn(editValue);
      setSuggestions(results.slice(0, 8));
      setShowSuggestions(results.length > 0);
      setSelectedIndex(-1);
    };

    const debounce = setTimeout(fetchSuggestions, 200);
    return () => clearTimeout(debounce);
  }, [editValue, isEditing, isMagic, isPokemon, hasPricing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditValue(cardName);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue(cardName);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSave = async () => {
    if (editValue.trim() === cardName) {
      handleCancel();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(id, editValue.trim());
      setIsEditing(false);
      setSuggestions([]);
      setShowSuggestions(false);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        setEditValue(suggestions[selectedIndex]);
        setShowSuggestions(false);
      } else {
        handleSave();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    }
  };

  const selectSuggestion = (suggestion: string) => {
    setEditValue(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleQuantityFoundChange = (value: string) => {
    if (value === 'unchecked') {
      onQuantityFoundChange(id, null);
    } else {
      onQuantityFoundChange(id, parseInt(value, 10));
    }
  };

  const handlePriceBlur = () => {
    const parsed = parseFloat(localPriceInput);
    if (localPriceInput === '' || isNaN(parsed)) {
      onUnitPriceChange(id, null);
      setLocalPriceInput('');
    } else {
      onUnitPriceChange(id, parsed);
      setLocalPriceInput(parsed.toFixed(2));
    }
  };

  // Generate quantity options from 0 to requested quantity
  const quantityOptions = Array.from({ length: quantity + 1 }, (_, i) => i);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-secondary/50">
        <StatusIcon />
        <span className="font-mono text-sm text-muted-foreground w-8 shrink-0">
          {quantity}×
        </span>
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            className="h-8 text-sm"
            disabled={isSaving}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div 
              ref={suggestionsRef}
              className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-y-auto"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-secondary/80 transition-colors",
                    index === selectedIndex && "bg-secondary"
                  )}
                  onMouseDown={() => selectSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4 text-green-500" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleCancel}
            disabled={isSaving}
          >
            <X className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  }

  const cardContent = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 py-2 px-3 rounded-lg hover:bg-secondary/50 transition-colors group",
        isNotFound && "bg-destructive/10 border border-destructive/30",
        inventoryStatus === 'none' && "opacity-60"
      )}
    >
      {/* Row 1: Status + Quantity + Card Name + Edit */}
      <StatusIcon />

      <span className="font-mono text-sm text-muted-foreground w-8 shrink-0">
        {quantity}×
      </span>
      <span className={cn(
        "truncate flex-1 min-w-0",
        hasPricing && "group-hover:text-primary transition-colors",
        isNotFound && "text-destructive"
      )}>
        {cardName}
      </span>
      {isNotFound && (
        <span className="text-xs text-destructive shrink-0">Not found</span>
      )}
      {hasPricing && !isNotFound && cardUrl && (
        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      )}

      {/* Edit Button - Always visible on mobile, hover on desktop */}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => { e.preventDefault(); handleStartEdit(e); }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      {/* Row 2: Inventory controls - wrap to second line on mobile */}
      <div className="flex items-center gap-2 w-full sm:w-auto pl-12 sm:pl-0 sm:ml-auto">
        {/* Found Quantity Selector */}
        <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <Select
            value={quantityFound === null ? 'unchecked' : quantityFound.toString()}
            onValueChange={handleQuantityFoundChange}
          >
            <SelectTrigger className="w-20 h-8 text-xs">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unchecked">
                <span className="text-muted-foreground">—</span>
              </SelectItem>
              {quantityOptions.map((num) => (
                <SelectItem key={num} value={num.toString()}>
                  {num}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Manual Price Input - hidden when using condition variants */}
        {!hasConditionVariants && (
          <div
            className="relative w-20 shrink-0"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
            <Input
              type="text"
              inputMode="decimal"
              value={localPriceInput}
              onChange={(e) => setLocalPriceInput(e.target.value)}
              onBlur={handlePriceBlur}
              placeholder="0.00"
              className="h-8 text-xs pl-5 pr-2 font-mono"
            />
          </div>
        )}

        {/* Spacer when using condition variants */}
        {hasConditionVariants && <div className="w-20 shrink-0" />}

        {/* Line Total or API Reference */}
        <div className="w-20 text-right shrink-0">
          {lineTotalFormatted ? (
            <span className="text-sm font-mono text-green-500">
              ${lineTotalFormatted}
            </span>
          ) : apiPrice && hasPricing ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-mono text-muted-foreground/50 cursor-help">
                  ~${apiPrice}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>API reference price (not used in email)</p>
              </TooltipContent>
            </Tooltip>
          ) : priceLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />
          ) : (
            <span className="text-xs text-muted-foreground/30">—</span>
          )}
        </div>
      </div>
    </div>
  );

  // Wrap card content with condition breakdown
  const cardContentWithBreakdown = (
    <div>
      {cardContent}
      {quantityFound !== null && quantityFound > 0 && (
        <div className="ml-4">
          <ConditionBreakdown
            itemId={id}
            quantityFound={quantityFound}
            variants={conditionVariants}
            onChange={onConditionVariantsChange}
          />
        </div>
      )}
    </div>
  );

  // No hover card for games without pricing/images
  if (!hasPricing || !cardUrl) {
    return cardContentWithBreakdown;
  }

  // Games with hover card (Magic, Pokémon)
  return (
    <div>
      <HoverCard openDelay={300} closeDelay={100}>
        <HoverCardTrigger asChild>
          <a
            href={cardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            onClick={(e) => {
              // Don't navigate if clicking interactive elements
              if ((e.target as HTMLElement).closest('button, [role="combobox"], input')) {
                e.preventDefault();
              }
            }}
          >
            {cardContent}
          </a>
        </HoverCardTrigger>
        <HoverCardContent 
          side="left" 
          align="center"
          sideOffset={16}
          avoidCollisions={true}
          collisionPadding={20}
          className="w-auto p-2 bg-card border-border z-[100]"
          style={{ position: 'fixed' }}
        >
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={cardName}
              className="rounded-lg w-[300px] h-auto"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-[300px] h-[420px] bg-secondary/50 rounded-lg flex items-center justify-center">
              <ImageOff className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          {setInfo && (
            <div className="mt-2 text-xs text-muted-foreground text-center">
              {setInfo.name}{setInfo.rarity && ` • ${setInfo.rarity}`}
              {apiPrice && <span className="ml-2 text-foreground">${apiPrice}</span>}
            </div>
          )}
        </HoverCardContent>
      </HoverCard>
      
      {/* Condition breakdown outside the link */}
      {quantityFound !== null && quantityFound > 0 && (
        <div className="ml-4">
          <ConditionBreakdown
            itemId={id}
            quantityFound={quantityFound}
            variants={conditionVariants}
            onChange={onConditionVariantsChange}
          />
        </div>
      )}
    </div>
  );
}
