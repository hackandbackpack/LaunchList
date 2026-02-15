import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, CheckCircle2, Clock, Package, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { GameBadge } from '@/components/GameBadge';
import api from '@/integrations/api/client';
import { CONFIG } from '@/lib/config';
import type { DeckRequest, DeckLineItem, GameType, RequestStatus } from '@/lib/types';

const STATUS_STEPS = [
  { status: 'submitted', label: 'Submitted', icon: Clock, description: 'We received your request' },
  { status: 'in_progress', label: 'In Progress', icon: Package, description: 'Staff is pulling your cards' },
  { status: 'ready', label: 'Ready', icon: CheckCircle2, description: 'Ready for pickup!' },
  { status: 'picked_up', label: 'Picked Up', icon: Truck, description: 'Order complete' },
];

// Map API response to frontend type
function mapApiOrderToFrontend(apiOrder: {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string | null;
  notifyMethod: string | null;
  game: string;
  format: string | null;
  pickupWindow: string | null;
  notes: string | null;
  rawDecklist: string;
  status: string;
  staffNotes: string | null;
  estimatedTotal: number | null;
  missingItems: string | null;
  createdAt: string;
  updatedAt: string;
}): DeckRequest {
  return apiOrder as DeckRequest;
}

function mapApiItemsToFrontend(apiItems: {
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
}[]): DeckLineItem[] {
  return apiItems as DeckLineItem[];
}

export default function StatusPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const orderFromUrl = searchParams.get('order') || '';

  // Try to restore email from sessionStorage if we have an order number
  const getStoredEmail = () => {
    if (orderFromUrl) {
      return sessionStorage.getItem(`order_email_${orderFromUrl}`) || '';
    }
    return '';
  };

  const [orderNumber, setOrderNumber] = useState(orderFromUrl);
  const [email, setEmail] = useState(getStoredEmail());
  const [request, setRequest] = useState<DeckRequest | null>(null);
  const [lineItems, setLineItems] = useState<DeckLineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearchWithParams = useCallback(async (order: string, emailAddr: string) => {
    setLoading(true);
    setSearched(true);

    try {
      const orderData = await api.orders.lookup(order.trim(), emailAddr.trim());

      if (!orderData) {
        setRequest(null);
        setLineItems([]);
        setLoading(false);
        return;
      }

      const foundRequest = mapApiOrderToFrontend(orderData);
      setRequest(foundRequest);

      // Store email in sessionStorage (not in URL for privacy)
      sessionStorage.setItem(`order_email_${foundRequest.orderNumber}`, emailAddr.trim().toLowerCase());

      // Only store order number in URL, not email
      setSearchParams({ order: foundRequest.orderNumber });

      const itemsData = await api.orders.getLineItems(foundRequest.id, emailAddr.trim());
      setLineItems(mapApiItemsToFrontend(itemsData));
    } catch {
      setRequest(null);
      setLineItems([]);
    }

    setLoading(false);
  }, [setSearchParams]);

  useEffect(() => {
    // Auto-search if we have order in URL and email in storage
    const storedEmail = orderFromUrl ? sessionStorage.getItem(`order_email_${orderFromUrl}`) : null;
    if (orderFromUrl && storedEmail) {
      setEmail(storedEmail);
      handleSearchWithParams(orderFromUrl, storedEmail);
    }
  }, [orderFromUrl, handleSearchWithParams]);

  const handleSearch = async () => {
    if (!orderNumber.trim() || !email.trim()) {
      toast.error('Please enter both order number and email');
      return;
    }

    await handleSearchWithParams(orderNumber, email);
  };

  const getStatusIndex = (status: RequestStatus): number => {
    if (status === 'cancelled') return -1;
    return STATUS_STEPS.findIndex(s => s.status === status);
  };

  const currentIndex = request ? getStatusIndex(request.status as RequestStatus) : -1;

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Track Your <span className="text-gradient">Order</span>
            </h1>
            <p className="text-muted-foreground">
              Enter your order number and email to check your order status.
            </p>
          </div>

          {/* Search Form */}
          <Card className="glow-card mb-8 animate-slide-up">
            <CardContent className="pt-6">
              <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="orderNumber">Order Number</Label>
                      <Input
                        id="orderNumber"
                        placeholder="LP-XXXXXXXX"
                        value={orderNumber}
                        onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full"
                    variant="hero"
                  >
                    <Search className="mr-2 h-4 w-4" />
                    {loading ? 'Searching...' : 'Find Order'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Results */}
          {searched && !loading && (
            <>
              {request ? (
                <div className="space-y-6 animate-fade-in">
                  {/* Status Timeline */}
                  <Card className="glow-card">
                    <CardHeader>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="font-mono text-primary">{request.orderNumber}</CardTitle>
                        <StatusBadge status={request.status as RequestStatus} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {request.status === 'cancelled' ? (
                        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                          <XCircle className="h-8 w-8 text-red-400" />
                          <div>
                            <p className="font-medium text-red-400">Order Cancelled</p>
                            <p className="text-sm text-muted-foreground">
                              This order has been cancelled. Please contact us for more info.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          {/* Timeline line */}
                          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

                          <div className="space-y-6">
                            {STATUS_STEPS.map((step, index) => {
                              const isComplete = index <= currentIndex;
                              const isCurrent = index === currentIndex;
                              const StepIcon = step.icon;

                              return (
                                <div key={step.status} className="flex items-start gap-4 relative">
                                  <div
                                    className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all ${
                                      isComplete
                                        ? 'bg-primary border-primary'
                                        : 'bg-card border-border'
                                    } ${isCurrent ? 'pulse-glow' : ''}`}
                                  >
                                    <StepIcon
                                      className={`h-5 w-5 ${
                                        isComplete ? 'text-primary-foreground' : 'text-muted-foreground'
                                      }`}
                                    />
                                  </div>
                                  <div className="pt-2">
                                    <p
                                      className={`font-medium ${
                                        isComplete ? 'text-foreground' : 'text-muted-foreground'
                                      }`}
                                    >
                                      {step.label}
                                    </p>
                                    <p className="text-sm text-muted-foreground">{step.description}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Order Details */}
                  <Card className="glow-card">
                    <CardHeader>
                      <CardTitle>Order Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Customer</p>
                          <p className="font-medium">{request.customerName}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Game</p>
                          <GameBadge game={request.game as GameType} />
                        </div>
                        <div>
                          <p className="text-muted-foreground">Cards</p>
                          <p className="font-medium">
                            {lineItems.reduce((sum, i) => sum + i.quantity, 0)} cards
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Submitted</p>
                          <p className="font-medium">
                            {new Date(request.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pickup Info */}
                  {request.status === 'ready' && (
                    <Card className="glow-card border-green-500/30 bg-green-500/5">
                      <CardContent className="py-6">
                        <div className="flex items-start gap-4">
                          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/20">
                            <CheckCircle2 className="h-6 w-6 text-green-400" />
                          </div>
                          <div>
                            <p className="font-bold text-green-400 text-lg">Your order is ready!</p>
                            <p className="text-muted-foreground mt-1">
                              Come to <strong>{CONFIG.store.name}</strong> to pick up your cards.
                            </p>
                            <p className="text-sm text-muted-foreground mt-2">
                              Please bring a valid ID and your order number.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card className="glow-card animate-fade-in">
                  <CardContent className="py-12 text-center">
                    <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">Order Not Found</p>
                    <p className="text-muted-foreground">
                      We couldn't find an order with that number and email combination.
                      Please check your details and try again.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
