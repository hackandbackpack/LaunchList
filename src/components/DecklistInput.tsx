import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { autocompleteCardName as scryfallAutocomplete } from '@/lib/scryfall';
import { autocompleteCardName as pokemonAutocomplete } from '@/lib/pokemontcg';
import { cn } from '@/lib/utils';
import type { GameType } from '@/lib/types';

interface DecklistInputProps {
  value: string;
  onChange: (value: string) => void;
  game: GameType;
  className?: string;
  placeholder?: string;
}

interface LineValidation {
  lineIndex: number;
  cardName: string;
  isValid: boolean;
  suggestion?: string;
}

// Get the appropriate autocomplete function based on game type
function getAutocompleteForGame(game: GameType): ((query: string) => Promise<string[]>) | null {
  switch (game) {
    case 'magic':
      return scryfallAutocomplete;
    case 'pokemon':
      return pokemonAutocomplete;
    default:
      return null;
  }
}

export function DecklistInput({
  value,
  onChange,
  game,
  className,
  placeholder,
}: DecklistInputProps) {
  const autocompleteFunction = getAutocompleteForGame(game);
  const hasAutocomplete = autocompleteFunction !== null;
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [validations, setValidations] = useState<Map<number, LineValidation>>(new Map());
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Parse current line to extract card name
  const parseCurrentLine = useCallback((text: string, cursorPos: number) => {
    const textBeforeCursor = text.substring(0, cursorPos);
    const linesBefore = textBeforeCursor.split('\n');
    const lineIndex = linesBefore.length - 1;
    const fullLines = text.split('\n');

    setCurrentLineIndex(lineIndex);

    const line = fullLines[lineIndex] || '';
    const match = line.match(/^\s*(\d+)\s*[xX]?\s+(.*)$/);
    if (match) {
      return { lineIndex, cardName: match[2] };
    }
    return { lineIndex, cardName: line };
  }, []);

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (cardName: string) => {
    if (!autocompleteFunction || cardName.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const results = await autocompleteFunction(cardName);
      setSuggestions(results.slice(0, 6));
      setShowSuggestions(results.length > 0);
      setSelectedSuggestionIndex(-1);
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [autocompleteFunction]);

  // Handle text changes
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart;
    
    onChange(newValue);
    setCursorPosition(newCursorPos);
    
    // Debounce autocomplete
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    const { cardName } = parseCurrentLine(newValue, newCursorPos);
    
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(cardName);
    }, 200);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        Math.min(prev + 1, suggestions.length - 1)
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Tab' || (e.key === 'Enter' && selectedSuggestionIndex >= 0)) {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0) {
        selectSuggestion(suggestions[selectedSuggestionIndex]);
      } else if (suggestions.length > 0) {
        selectSuggestion(suggestions[0]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Select a suggestion
  const selectSuggestion = (suggestion: string) => {
    const lines = value.split('\n');
    const currentLine = lines[currentLineIndex];
    
    // Parse the current line to preserve quantity
    const match = currentLine.match(/^(\s*\d+\s*[xX]?\s+)/);
    const prefix = match ? match[1] : '';
    
    // Replace the current line with the suggestion
    lines[currentLineIndex] = prefix + suggestion;
    const newValue = lines.join('\n');
    
    onChange(newValue);
    setShowSuggestions(false);
    setSuggestions([]);
    
    // Move cursor to end of current line
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = lines.slice(0, currentLineIndex + 1).join('\n').length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  // Handle blur
  const handleBlur = () => {
    // Delay hiding to allow click on suggestion
    setTimeout(() => setShowSuggestions(false), 200);
  };

  // Calculate suggestion popup position
  const getSuggestionPosition = () => {
    if (!textareaRef.current) return { top: 0, left: 0 };
    
    const textarea = textareaRef.current;
    const lines = value.split('\n').slice(0, currentLineIndex + 1);
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
    
    return {
      top: (lines.length) * lineHeight + 8,
      left: 0,
    };
  };

  const position = getSuggestionPosition();

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={cn("font-mono text-sm", className)}
        placeholder={placeholder}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div 
          ref={suggestionsRef}
          className="absolute z-50 w-full max-w-md bg-popover border border-border rounded-md shadow-lg overflow-hidden"
          style={{ top: position.top, left: position.left }}
        >
          {isLoadingSuggestions && (
            <div className="px-3 py-2 flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching...
            </div>
          )}
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2",
                index === selectedSuggestionIndex && "bg-secondary"
              )}
              onMouseDown={() => selectSuggestion(suggestion)}
            >
              <Check className="h-3 w-3 text-green-500 opacity-50" />
              {suggestion}
            </button>
          ))}
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border bg-secondary/30">
            Press Tab to autocomplete • ↑↓ to navigate
          </div>
        </div>
      )}
    </div>
  );
}
