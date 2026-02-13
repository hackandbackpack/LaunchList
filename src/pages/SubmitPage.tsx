import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Upload, AlertCircle, Check, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DecklistInput } from '@/components/DecklistInput';
import { parseDecklist, validateDecklist, type ParsedCard } from '@/lib/deckParser';
import { GAME_LABELS, type GameType, type NotifyMethod } from '@/lib/types';
import api from '@/integrations/api/client';

const submitSchema = z.object({
  customerName: z.string().trim().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().trim().email('Invalid email').max(255, 'Email too long'),
  phone: z.string().trim()
    .min(1, 'Phone number is required')
    .max(20, 'Phone too long')
    .regex(/^\d{3}[-.]?\d{3}[-.]?\d{4}$/, 'Enter a valid phone number (e.g., 555.867.5309)'),
  notifyMethod: z.literal('email'),
  game: z.enum(['magic', 'onepiece', 'pokemon', 'other']),
  format: z.string().trim().max(100, 'Format too long').optional(),
  pickupWindow: z.string().trim().max(200, 'Pickup window too long').optional(),
  notes: z.string().trim().max(1000, 'Notes too long').optional(),
  rawDecklist: z.string().trim().min(1, 'Decklist is required'),
});

type SubmitFormData = z.infer<typeof submitSchema>;

export default function SubmitPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'input' | 'preview'>('input');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SubmitFormData>({
    resolver: zodResolver(submitSchema),
    defaultValues: {
      notifyMethod: 'email',
      game: 'magic',
    },
  });

  const rawDecklist = watch('rawDecklist');
  const selectedGame = watch('game');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      toast.error('File too large. Maximum size is 1MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setValue('rawDecklist', text);
      handleParse(text);
    };
    reader.readAsText(file);
  };

  const handleParse = (text?: string) => {
    const deckText = text || rawDecklist;
    if (!deckText?.trim()) {
      setParseErrors(['Please enter a decklist']);
      return;
    }

    setIsParsing(true);

    // Small delay for UX
    setTimeout(() => {
      const result = parseDecklist(deckText);
      setParsedCards(result.cards);
      setParseErrors([...result.errors, ...validateDecklist(result.cards)]);
      setStep('preview');
      setIsParsing(false);
    }, 300);
  };

  const onSubmit = async (data: SubmitFormData) => {
    if (parsedCards.length === 0) {
      toast.error('Please parse your decklist first');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare line items for the API
      const lineItems = parsedCards.map((card) => ({
        quantity: card.quantity,
        cardName: card.cardName,
        parseConfidence: card.parseConfidence,
        lineRaw: card.lineRaw,
      }));

      const result = await api.orders.submit({
        customerName: data.customerName,
        email: data.email,
        phone: data.phone,
        notifyMethod: data.notifyMethod as NotifyMethod,
        game: data.game as GameType,
        format: data.format,
        pickupWindow: data.pickupWindow,
        notes: data.notes,
        rawDecklist: data.rawDecklist,
        lineItems,
      });

      toast.success('Decklist submitted successfully!');
      sessionStorage.setItem('confirmationEmail', data.email);
      navigate(`/confirmation/${result.orderNumber}`);
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Failed to submit decklist. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Submit Your <span className="text-gradient">Decklist</span>
            </h1>
            <p className="text-muted-foreground">
              Paste or upload your decklist and we'll pull the singles for you.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* Contact Info */}
            <Card className="glow-card animate-slide-up">
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>How can we reach you when your order is ready?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerName">Name *</Label>
                    <Input
                      id="customerName"
                      placeholder="Your name"
                      {...register('customerName')}
                      className={errors.customerName ? 'border-destructive' : ''}
                    />
                    {errors.customerName && (
                      <p className="text-sm text-destructive">{errors.customerName.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      {...register('email')}
                      className={errors.email ? 'border-destructive' : ''}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="555.867.5309"
                    {...register('phone')}
                    className={errors.phone ? 'border-destructive' : ''}
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive">{errors.phone.message}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label>Notification Preference</Label>
                  <RadioGroup
                    defaultValue="email"
                    className="flex gap-6"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="email" id="email-notify" checked />
                      <Label htmlFor="email-notify" className="cursor-pointer">Email</Label>
                    </div>
                    <div className="flex items-center space-x-2 opacity-50">
                      <RadioGroupItem value="sms" id="sms-notify" disabled />
                      <Label htmlFor="sms-notify" className="text-muted-foreground">
                        Text Message (Coming Soon)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>

            {/* Game Info */}
            <Card className="glow-card animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <CardHeader>
                <CardTitle>Game Details</CardTitle>
                <CardDescription>Tell us about your deck</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Game *</Label>
                    <Select
                      value={watch('game')}
                      onValueChange={(v) => setValue('game', v as GameType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(GAME_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="format">Format (optional)</Label>
                    <Input
                      id="format"
                      placeholder="e.g., Standard, Commander, Modern"
                      {...register('format')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pickupWindow">Preferred Pickup Time (optional)</Label>
                  <Input
                    id="pickupWindow"
                    placeholder="e.g., Saturday afternoon, After 5pm weekdays"
                    {...register('pickupWindow')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes & Preferences (optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="e.g., Any printing under $2 is fine, prefer cheapest NM, foil ok, etc."
                    className="min-h-[80px]"
                    {...register('notes')}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Decklist Input */}
            <Card className="glow-card animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Your Decklist
                </CardTitle>
                <CardDescription>
                  Paste your list or upload a file. Format: "4 Lightning Bolt" per line.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedGame === 'magic' || selectedGame === 'pokemon' ? (
                  <DecklistInput
                    value={rawDecklist || ''}
                    onChange={(v) => setValue('rawDecklist', v)}
                    game={selectedGame}
                    className="min-h-[200px]"
                    placeholder={selectedGame === 'magic'
                      ? `4 Lightning Bolt
4 Monastery Swiftspear
4 Goblin Guide
3 Eidolon of the Great Revel
...`
                      : `4 Pikachu
4 Charizard ex
2 Professor's Research
...`}
                  />
                ) : (
                  <Textarea
                    placeholder={`4 Card Name
4 Another Card
...`}
                    className="min-h-[200px] font-mono text-sm"
                    {...register('rawDecklist')}
                  />
                )}
                {errors.rawDecklist && (
                  <p className="text-sm text-destructive">{errors.rawDecklist.message}</p>
                )}

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv,.dek"
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => handleParse()}
                    disabled={isParsing || !rawDecklist?.trim()}
                    className="flex-1"
                  >
                    {isParsing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Parse & Preview
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Parsed Preview */}
            {step === 'preview' && parsedCards.length > 0 && (
              <Card className="glow-card animate-fade-in border-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Parsed Cards</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {parsedCards.reduce((sum, c) => sum + c.quantity, 0)} cards total
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {parseErrors.length > 0 && (
                    <div className="mb-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-yellow-500">Some lines need attention</p>
                          <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                            {parseErrors.slice(0, 5).map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                            {parseErrors.length > 5 && (
                              <li>...and {parseErrors.length - 5} more</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 font-medium">Qty</th>
                          <th className="text-left py-2 px-2 font-medium">Card Name</th>
                          <th className="text-right py-2 px-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedCards.map((card, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                            <td className="py-2 px-2 font-mono">{card.quantity}x</td>
                            <td className="py-2 px-2">{card.cardName}</td>
                            <td className="py-2 px-2 text-right">
                              {card.parseConfidence === 1 ? (
                                <span className="text-green-400">✓</span>
                              ) : (
                                <span className="text-yellow-400">⚠</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Submit */}
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="hero"
                size="lg"
                disabled={isSubmitting || parsedCards.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Decklist'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </PageLayout>
  );
}
