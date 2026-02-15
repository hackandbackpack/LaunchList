import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Mail, Phone, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/StatusBadge';
import { GameBadge } from '@/components/GameBadge';
import { DeckCardList } from '@/components/staff/DeckCardList';
import { useAuth } from '@/hooks/useAuth';
import api from '@/integrations/api/client';
import type { DeckRequest, DeckLineItem, RequestStatus, GameType } from '@/lib/types';

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

function mapApiItemsToFrontend(apiItems: Array<{
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
}>): DeckLineItem[] {
  return apiItems as DeckLineItem[];
}

export default function StaffRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isStaff, loading: authLoading } = useAuth();
  const [request, setRequest] = useState<DeckRequest | null>(null);
  const [lineItems, setLineItems] = useState<DeckLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<RequestStatus>('submitted');
  const [staffNotes, setStaffNotes] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || !isStaff)) {
      navigate('/staff/login');
    }
  }, [user, isStaff, authLoading, navigate]);

  useEffect(() => {
    if (id && isStaff) fetchRequest();
  }, [id, isStaff]);

  const fetchRequest = async () => {
    if (!id) return;
    setError(null);

    try {
      const { order, lineItems: items } = await api.staff.getOrder(id);
      const req = mapApiOrderToFrontend(order);
      setRequest(req);
      setStatus(req.status as RequestStatus);
      setStaffNotes(req.staff_notes || '');
      setLineItems(mapApiItemsToFrontend(items));
    } catch {
      setError('Failed to load order details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!id || !request || saving) return;

    setSaving(true);
    const previousStatus = request.status;

    try {
      await api.staff.updateOrder(id, { status, staffNotes });

      // Update local state with server-confirmed status
      setRequest(prev => prev ? { ...prev, status, staff_notes: staffNotes } : null);

      // Send notification based on server-confirmed previous status
      if (status === 'ready' && previousStatus !== 'ready') {
        try {
          await api.notifications.send(id, 'ready');
          toast.success('Order updated. Customer notified by email.');
        } catch {
          toast.error('Order updated but notification failed');
        }
      } else {
        toast.success('Order updated');
      }
    } catch {
      toast.error('Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center cosmic-bg"><span className="text-muted-foreground">Loading...</span></div>;
  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center cosmic-bg gap-4">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-muted-foreground">{error}</p>
      <Button variant="outline" onClick={fetchRequest}>Try Again</Button>
    </div>
  );
  if (!request) return <div className="min-h-screen flex items-center justify-center cosmic-bg"><span>Request not found</span></div>;

  return (
    <div className="min-h-screen cosmic-bg">
      <header className="border-b border-border bg-card/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center gap-2 sm:gap-4">
          <Link to="/staff/dashboard"><Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Back</span>
          </Button></Link>
          <span className="font-mono text-primary text-sm sm:text-base">{request.order_number}</span>
          <StatusBadge status={request.status as RequestStatus} />
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="glow-card">
            <CardHeader><CardTitle>Customer Info</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><strong>{request.customer_name}</strong></p>
              <p className="flex items-center gap-2"><Mail className="h-4 w-4" />{request.email}</p>
              {request.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{request.phone}</p>}
              <GameBadge game={request.game as GameType} />
              {request.format && <p>Format: {request.format}</p>}
              {request.pickup_window && <p className="flex items-center gap-2"><Clock className="h-4 w-4" />{request.pickup_window}</p>}
              {request.notes && <div className="p-3 bg-secondary/50 rounded-lg">{request.notes}</div>}
            </CardContent>
          </Card>
          <Card className="glow-card">
            <CardHeader><CardTitle>Update Status</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Select value={status} onValueChange={(v) => setStatus(v as RequestStatus)} disabled={saving}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['submitted', 'in_progress', 'ready', 'picked_up', 'cancelled'] as RequestStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea placeholder="Staff notes..." value={staffNotes} onChange={(e) => setStaffNotes(e.target.value)} className="min-h-[100px]" />
              <Button onClick={handleSave} disabled={saving} variant="hero" className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Save
              </Button>
            </CardContent>
          </Card>
        </div>
        <DeckCardList
          lineItems={lineItems}
          game={request.game as GameType}
          deckRequestId={request.id}
          customerName={request.customer_name}
          orderNumber={request.order_number}
          onItemUpdated={fetchRequest}
        />
      </main>
    </div>
  );
}
