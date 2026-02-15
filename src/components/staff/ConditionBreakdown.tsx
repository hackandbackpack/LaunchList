import { useState } from 'react';
import { Plus, Trash2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ConditionVariant } from '@/lib/types';

// Condition presets
const CONDITIONS = [
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
];

interface ConditionBreakdownProps {
  itemId: string;
  quantityFound: number;
  variants: ConditionVariant[];
  onChange: (itemId: string, variants: ConditionVariant[]) => void;
}

export function ConditionBreakdown({
  itemId,
  quantityFound,
  variants,
  onChange,
}: ConditionBreakdownProps) {
  const [isOpen, setIsOpen] = useState(variants.length > 0);
  const [customCondition, setCustomCondition] = useState('');

  // Calculate totals
  const totalQuantity = variants.reduce((sum, v) => sum + v.quantity, 0);
  const totalPrice = variants.reduce((sum, v) => sum + (v.quantity * v.price), 0);
  const quantityDiff = quantityFound - totalQuantity;
  const isValid = quantityDiff === 0 && variants.every(v => v.quantity > 0 && v.price >= 0 && v.condition.trim() !== '');

  const handleAddVariant = (condition?: string) => {
    const newCondition = condition || customCondition.trim();
    if (!newCondition) return;
    
    // Don't add duplicate conditions
    if (variants.some(v => v.condition.toLowerCase() === newCondition.toLowerCase())) {
      return;
    }

    const remainingQty = Math.max(0, quantityFound - totalQuantity);
    const newVariant: ConditionVariant = {
      condition: newCondition,
      quantity: remainingQty > 0 ? remainingQty : 1,
      price: 0,
    };
    
    onChange(itemId, [...variants, newVariant]);
    setCustomCondition('');
  };

  const handleRemoveVariant = (index: number) => {
    const newVariants = variants.filter((_, i) => i !== index);
    onChange(itemId, newVariants);
  };

  const handleUpdateVariant = (index: number, field: keyof ConditionVariant, value: string | number) => {
    const newVariants = [...variants];
    if (field === 'quantity') {
      newVariants[index] = { ...newVariants[index], quantity: Math.max(0, Number(value)) };
    } else if (field === 'price') {
      newVariants[index] = { ...newVariants[index], price: Math.max(0, Number(value)) };
    } else {
      newVariants[index] = { ...newVariants[index], condition: String(value) };
    }
    onChange(itemId, newVariants);
  };

  const handleClearAll = () => {
    if (variants.length === 0) return;
    if (!window.confirm('Clear all condition variants? This cannot be undone.')) return;
    onChange(itemId, []);
    setIsOpen(false);
  };

  // Get conditions not yet used
  const availableConditions = CONDITIONS.filter(
    c => !variants.some(v => v.condition.toLowerCase() === c.toLowerCase())
  );

  if (quantityFound === null || quantityFound === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
          onClick={(e) => {
            e.stopPropagation();
            // Let the CollapsibleTrigger handle the toggle
          }}
        >
          {isOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {variants.length > 0 
            ? `${variants.length} condition${variants.length !== 1 ? 's' : ''}`
            : '+ Breakdown by condition'
          }
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div 
          className="mt-2 ml-6 p-3 border border-border rounded-lg bg-secondary/30 space-y-2"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {/* Existing variants */}
          {variants.map((variant, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              {/* Condition select - full width on mobile */}
              <Select
                value={variant.condition}
                onValueChange={(value) => handleUpdateVariant(index, 'condition', value)}
              >
                <SelectTrigger className="w-full sm:w-40 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Current condition always shown */}
                  <SelectItem value={variant.condition}>{variant.condition}</SelectItem>
                  {/* Other available conditions */}
                  {availableConditions
                    .filter(c => c !== variant.condition)
                    .map(condition => (
                      <SelectItem key={condition} value={condition}>
                        {condition}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {/* Qty + Price + Total + Delete - in a row */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* Quantity input */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Qty:</span>
                  <Input
                    type="number"
                    min={1}
                    max={quantityFound}
                    value={variant.quantity}
                    onChange={(e) => handleUpdateVariant(index, 'quantity', e.target.value)}
                    className="w-14 h-7 text-xs font-mono"
                  />
                </div>

                {/* Price input */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">@</span>
                  <div className="relative">
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={variant.price || ''}
                      onChange={(e) => handleUpdateVariant(index, 'price', e.target.value)}
                      placeholder="0.00"
                      className="w-20 h-7 text-xs font-mono pl-4"
                    />
                  </div>
                </div>

                {/* Line total */}
                <span className="text-xs font-mono text-green-500 w-16 text-right">
                  ${(variant.quantity * variant.price).toFixed(2)}
                </span>

                {/* Remove button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => handleRemoveVariant(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}

          {/* Add new condition */}
          <div className="flex items-center gap-2 pt-1">
            <Select onValueChange={(value) => handleAddVariant(value)}>
              <SelectTrigger className="w-40 h-7 text-xs">
                <SelectValue placeholder="+ Add condition" />
              </SelectTrigger>
              <SelectContent>
                {availableConditions.map(condition => (
                  <SelectItem key={condition} value={condition}>
                    {condition}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <span className="text-xs text-muted-foreground">or</span>
            
            <Input
              type="text"
              value={customCondition}
              onChange={(e) => setCustomCondition(e.target.value)}
              placeholder="Custom condition"
              className="w-32 h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddVariant();
                }
              }}
            />
            
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleAddVariant()}
              disabled={!customCondition.trim()}
            >
              <Plus className="h-3 w-3" />
            </Button>

            {variants.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive ml-auto"
                onClick={handleClearAll}
              >
                Clear all
              </Button>
            )}
          </div>

          {/* Validation & totals */}
          {variants.length > 0 && (
            <div className={cn(
              "flex items-center justify-between pt-2 mt-2 border-t border-border text-xs",
              !isValid && "text-destructive"
            )}>
              <div className="flex items-center gap-2">
                {quantityDiff > 0 ? (
                  <span className="text-amber-600">
                    {totalQuantity} of {quantityFound} assigned — {quantityDiff} more to assign
                  </span>
                ) : quantityDiff < 0 ? (
                  <>
                    <AlertCircle className="h-3 w-3 text-red-600" />
                    <span className="text-red-600">
                      {Math.abs(quantityDiff)} over — remove {Math.abs(quantityDiff)} to continue
                    </span>
                  </>
                ) : (
                  <span className="text-green-600">
                    All {quantityFound} assigned
                  </span>
                )}
              </div>
              <span className="font-mono font-semibold text-green-500">
                Total: ${totalPrice.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
