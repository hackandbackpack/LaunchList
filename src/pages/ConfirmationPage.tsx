import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Copy, Mail, Clock } from 'lucide-react';
import { toast } from 'sonner';

import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { GameBadge } from '@/components/GameBadge';
import api from '@/integrations/api/client';
import { CONFIG } from '@/lib/config';
import type { DeckRequest, DeckLineItem, GameType, RequestStatus } from '@/lib/types';

// Map API response to frontend type
function mapApiOrderToFrontend(apiOrder: {
  id: string;
  order_number: string;
  customer_name: string;
  email: string;
  phone: string | null;
  notify_method: string | null;
  game: string;
  format: string | null;
  pickup_window: string | null;
  notes: string | null;
  raw_decklist: string;
  status: string;
  staff_notes: string | null;
  estimated_total: number | null;
  missing_items: string | null;
  created_at: string;
  updated_at: string;
}): DeckRequest {
  return apiOrder as DeckRequest;
}

function mapApiItemsToFrontend(apiItems: {
  id: string;
  deck_request_id: string;
  quantity: number;
  card_name: string;
  parse_confidence: number | null;
  line_raw: string;
  quantity_found: number | null;
  unit_price: number | null;
  condition_variants: string | null;
  created_at: string;
}[]): DeckLineItem[] {
  return apiItems as DeckLineItem[];
}

export default function ConfirmationPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();

  const email = sessionStorage.getItem('confirmationEmail');

  const [request, setRequest] = useState<DeckRequest | null>(null);
  const [lineItems, setLineItems] = useState<DeckLineItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrder = useCallback(async () => {
    if (!orderNumber || !email) return;

    setLoading(true);

    try {
      const orderData = await api.orders.lookup(orderNumber, email);

      if (!orderData) {
        toast.error('Order not found or email does not match');
        setLoading(false);
        return;
      }

      const foundRequest = mapApiOrderToFrontend(orderData);
      setRequest(foundRequest);

      const itemsData = await api.orders.getLineItems(foundRequest.id, email);
      setLineItems(mapApiItemsToFrontend(itemsData));
    } catch {
      toast.error('Order not found or email does not match');
    }

    setLoading(false);
  }, [orderNumber, email]);

  useEffect(() => {
    if (!orderNumber) {
      navigate('/', { replace: true });
      return;
    }

    if (!email) {
      // Email not in session — user may have navigated directly
      setLoading(false);
      return;
    }

    fetchOrder();
  }, [orderNumber, email, navigate, fetchOrder]);

  const copyOrderNumber = () => {
    navigator.clipboard.writeText(orderNumber || '');
    toast.success('Order number copied!');
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <div className="animate-pulse">
              <div className="h-16 w-16 rounded-full bg-secondary mx-auto mb-4" />
              <div className="h-8 bg-secondary rounded w-1/2 mx-auto mb-4" />
              <div className="h-4 bg-secondary rounded w-3/4 mx-auto" />
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!email && !loading) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-12 max-w-lg text-center">
          <h2 className="text-xl font-semibold mb-4">Verify Your Order</h2>
          <p className="text-muted-foreground mb-6">Enter the email address you used when submitting your order.</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const inputEmail = formData.get('email') as string;
            if (inputEmail) {
              sessionStorage.setItem('confirmationEmail', inputEmail);
              window.location.reload();
            }
          }}>
            <Input name="email" type="email" placeholder="your@email.com" required className="mb-4" />
            <Button type="submit">Verify</Button>
          </form>
        </div>
      </PageLayout>
    );
  }

  if (!request) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-2xl font-bold mb-4">Order Not Found</h1>
            <p className="text-muted-foreground mb-8">
              We couldn't find an order with that number and email combination.
            </p>
            <Link to="/submit">
              <Button variant="hero">Submit a New Decklist</Button>
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  const totalCards = lineItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Success Header */}
          <div className="text-center mb-8 animate-slide-up">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 mb-6 pulse-glow">
              <CheckCircle2 className="h-10 w-10 text-green-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              Decklist <span className="text-gradient">Submitted!</span>
            </h1>
            <p className="text-muted-foreground">
              We've received your request and will start pulling your cards soon.
            </p>
          </div>

          {/* Order Number */}
          <Card className="glow-card mb-6 animate-fade-in">
            <CardContent className="py-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Order Number</p>
                  <p className="text-2xl font-mono font-bold text-primary">{request.order_number}</p>
                </div>
                <Button variant="outline" onClick={copyOrderNumber}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Status & Details */}
          <Card className="glow-card mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Order Details</CardTitle>
                <StatusBadge status={request.status as RequestStatus} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{request.customer_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Game</p>
                  <GameBadge game={request.game as GameType} />
                </div>
                <div>
                  <p className="text-muted-foreground">Total Cards</p>
                  <p className="font-medium">{totalCards} cards</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Notification</p>
                  <p className="font-medium flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {request.email}
                  </p>
                </div>
                {request.format && (
                  <div>
                    <p className="text-muted-foreground">Format</p>
                    <p className="font-medium">{request.format}</p>
                  </div>
                )}
                {request.pickup_window && (
                  <div>
                    <p className="text-muted-foreground">Pickup</p>
                    <p className="font-medium flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {request.pickup_window}
                    </p>
                  </div>
                )}
              </div>
              {request.notes && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Notes</p>
                  <p className="text-sm bg-secondary/50 rounded-lg p-3">{request.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card List */}
          <Card className="glow-card mb-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <CardHeader>
              <CardTitle>Cards Requested</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium">Qty</th>
                      <th className="text-left py-2 px-2 font-medium">Card Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => (
                      <tr key={item.id} className="border-b border-border/50">
                        <td className="py-2 px-2 font-mono">{item.quantity}x</td>
                        <td className="py-2 px-2">{item.card_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Next Steps */}
          <Card className="glow-card animate-fade-in border-primary/30" style={{ animationDelay: '0.3s' }}>
            <CardHeader>
              <CardTitle>What's Next?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <strong>Confirmation email</strong> has been sent to {request.email}
              </p>
              <p>
                Our staff will search for your cards and update your order status
              </p>
              <p>
                <strong>We'll notify you</strong> when your order is ready for pickup
              </p>
              <p>
                Come to <strong>{CONFIG.store.name}</strong> to pick up your cards!
              </p>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mt-8 justify-center">
            <Link to={`/status?order=${request.order_number}`}>
              <Button variant="outline" className="w-full sm:w-auto">
                Track Order Status
              </Button>
            </Link>
            <Link to="/submit">
              <Button variant="hero" className="w-full sm:w-auto">
                Submit Another Decklist
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
