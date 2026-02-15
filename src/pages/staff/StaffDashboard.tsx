import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Rocket, LogOut, Search, Filter, RefreshCw,
  ClipboardList, Clock, CheckCircle2, Package, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/StatusBadge';
import { GameBadge } from '@/components/GameBadge';
import { useAuth } from '@/hooks/useAuth';
import api from '@/integrations/api/client';
import { CONFIG } from '@/lib/config';
import type { DeckRequest, RequestStatus, GameType } from '@/lib/types';

// Map API response to frontend type
function mapApiOrdersToFrontend(apiOrders: Array<{
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
}>): DeckRequest[] {
  return apiOrders as DeckRequest[];
}

export default function StaffDashboard() {
  const navigate = useNavigate();
  const { user, isStaff, isAdmin, signOut, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<DeckRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/staff/login');
    } else if (!authLoading && user && !isStaff) {
      toast.error('You do not have staff access');
      navigate('/staff/login');
    }
  }, [user, isStaff, authLoading, navigate]);

  useEffect(() => {
    if (isStaff) {
      fetchRequests();
    }
  }, [isStaff, page]);

  // Reset to page 1 and refetch when status filter changes
  useEffect(() => {
    if (isStaff) {
      setPage(1);
      fetchRequests(1);
    }
  }, [statusFilter]);

  const fetchRequests = async (pageNum = page) => {
    setLoading(true);
    setError(null);

    try {
      const params: { limit: number; offset: number; status?: RequestStatus } = {
        limit: 25,
        offset: (pageNum - 1) * 25,
      };
      if (statusFilter !== 'all') {
        params.status = statusFilter as RequestStatus;
      }
      const response = await api.staff.getOrders(params);
      setRequests(mapApiOrdersToFrontend(response.orders));
      setTotalOrders(response.total);
    } catch {
      setError('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/staff/login');
  };

  const filteredRequests = requests.filter((req) => {
    // Apply status filter
    if (statusFilter !== 'all' && req.status !== statusFilter) {
      return false;
    }

    // Apply search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      req.orderNumber.toLowerCase().includes(query) ||
      req.customerName.toLowerCase().includes(query) ||
      req.email.toLowerCase().includes(query)
    );
  });

  const stats = {
    submitted: requests.filter(r => r.status === 'submitted').length,
    inProgress: requests.filter(r => r.status === 'in_progress').length,
    ready: requests.filter(r => r.status === 'ready').length,
    total: requests.length,
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center cosmic-bg">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen cosmic-bg">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <Rocket className="h-6 w-6 text-primary" />
              <span className="font-bold text-gradient hidden sm:inline">{CONFIG.store.name}</span>
            </Link>
            <span className="text-muted-foreground">|</span>
            <span className="font-medium">Staff Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Link to="/staff/admin">
                <Button variant="ghost" size="sm">Admin</Button>
              </Link>
            )}
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Submitted', value: stats.submitted, icon: ClipboardList, color: 'text-blue-400' },
            { label: 'In Progress', value: stats.inProgress, icon: Clock, color: 'text-yellow-400' },
            { label: 'Ready', value: stats.ready, icon: CheckCircle2, color: 'text-green-400' },
            { label: 'Total', value: stats.total, icon: Package, color: 'text-primary' },
          ].map((stat) => (
            <Card key={stat.label} className="glow-card">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  </div>
                  <stat.icon className={`h-8 w-8 ${stat.color} opacity-50`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="glow-card mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by order #, name, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="picked_up">Picked Up</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={fetchRequests}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requests Table */}
        <Card className="glow-card">
          <CardHeader>
            <CardTitle>Deck Pull Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-muted-foreground">{error}</p>
                <Button variant="outline" onClick={fetchRequests}>Try Again</Button>
              </div>
            ) : loading ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading requests...
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">No orders yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Orders will appear here when customers submit decklists.</p>
              </div>
            ) : (
              <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 font-medium">Order #</th>
                      <th className="text-left py-3 px-2 font-medium hidden sm:table-cell">Customer</th>
                      <th className="text-left py-3 px-2 font-medium hidden md:table-cell">Game</th>
                      <th className="text-left py-3 px-2 font-medium">Status</th>
                      <th className="text-left py-3 px-2 font-medium hidden lg:table-cell">Date</th>
                      <th className="text-right py-3 px-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map((req) => (
                      <tr key={req.id} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="py-3 px-2">
                          <span className="font-mono text-primary">{req.orderNumber}</span>
                        </td>
                        <td className="py-3 px-2 hidden sm:table-cell">
                          <div>
                            <p className="font-medium">{req.customerName}</p>
                            <p className="text-xs text-muted-foreground">{req.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-2 hidden md:table-cell">
                          <GameBadge game={req.game as GameType} />
                        </td>
                        <td className="py-3 px-2">
                          <StatusBadge status={req.status as RequestStatus} />
                        </td>
                        <td className="py-3 px-2 hidden lg:table-cell text-muted-foreground">
                          {new Date(req.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <Link to={`/staff/request/${req.id}`}>
                            <Button variant="outline" size="sm">
                              View
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalOrders > 25 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">
                    Showing {((page - 1) * 25) + 1}-{Math.min(page * 25, totalOrders)} of {totalOrders}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * 25 >= totalOrders}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
