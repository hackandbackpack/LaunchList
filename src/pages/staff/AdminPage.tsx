import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, Plus, Trash2, ArrowLeft, Users, Shield, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import api from '@/integrations/api/client';
import type { StaffUser, UserRole } from '@/integrations/api/types';

const createUserSchema = z.object({
  email: z.string().trim().email('Invalid email'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('staff');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
  });

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/staff/login');
    }
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  async function loadUsers() {
    setLoading(true);
    try {
      const response = await api.admin.getUsers();
      setStaffUsers(response.users);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  const onCreateUser = async (data: CreateUserFormData) => {
    setCreating(true);
    try {
      await api.admin.createUser({
        email: data.email,
        password: data.password,
        role: selectedRole,
      });
      toast.success('User created successfully');
      setCreateDialogOpen(false);
      reset();
      setSelectedRole('staff');
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  async function handleDeleteUser(userId: string) {
    setDeletingId(userId);
    try {
      await api.admin.deleteUser(userId);
      toast.success('User deleted');
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  }

  if (authLoading || (!isAdmin && !authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center cosmic-bg stars">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen cosmic-bg stars p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/staff/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gradient">User Management</h1>
          </div>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="hero" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Staff User</DialogTitle>
                <DialogDescription>
                  The user will be required to change their password on first login.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onCreateUser)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-email">Email</Label>
                  <Input
                    id="create-email"
                    type="email"
                    placeholder="newstaff@blastoffgaming.com"
                    {...register('email')}
                    className={errors.email ? 'border-destructive' : ''}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-password">Temporary Password</Label>
                  <Input
                    id="create-password"
                    type="password"
                    placeholder="At least 12 characters"
                    {...register('password')}
                    className={errors.password ? 'border-destructive' : ''}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Create User
                    </>
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="glow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Staff Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : staffUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No users found.</p>
            ) : (
              <div className="space-y-3">
                {staffUsers.map((staffUser) => (
                  <div
                    key={staffUser.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card/50"
                  >
                    <div className="flex items-center gap-3">
                      {staffUser.role === 'admin' ? (
                        <ShieldCheck className="h-5 w-5 text-amber-500" />
                      ) : (
                        <Shield className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{staffUser.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={staffUser.role === 'admin' ? 'default' : 'secondary'}>
                            {staffUser.role}
                          </Badge>
                          {staffUser.mustChangePassword && (
                            <Badge variant="outline" className="text-amber-500 border-amber-500">
                              Must change password
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Created {new Date(staffUser.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {staffUser.id !== user?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={deletingId === staffUser.id}
                          >
                            {deletingId === staffUser.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {staffUser.email}?
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteUser(staffUser.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
