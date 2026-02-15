import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CONFIG } from '@/lib/config';
import api from '@/integrations/api/client';
import logo from '@/assets/logo.png';

const resetPasswordSchema = z.object({
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center cosmic-bg stars p-4">
        <Card className="w-full max-w-md glow-card">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-destructive">Invalid or missing reset token.</p>
            <Link
              to="/staff/forgot-password"
              className="text-sm text-primary hover:underline"
            >
              Request a new reset link
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const onSubmit = async (data: ResetPasswordFormData) => {
    setLoading(true);
    try {
      await api.auth.resetPassword(token, data.newPassword);
      toast.success('Password has been reset. Please log in.');
      navigate('/staff/login');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center cosmic-bg stars p-4">
      <Card className="w-full max-w-md glow-card animate-slide-up">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img
              src={logo}
              alt={CONFIG.store.name}
              className="h-16 w-auto"
            />
          </div>
          <CardTitle className="text-2xl">
            <span className="text-gradient">Set New Password</span>
          </CardTitle>
          <CardDescription>
            Choose a new password for your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="At least 12 characters"
                {...register('newPassword')}
                className={errors.newPassword ? 'border-destructive' : ''}
              />
              {errors.newPassword && (
                <p className="text-sm text-destructive">{errors.newPassword.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter new password"
                {...register('confirmPassword')}
                className={errors.confirmPassword ? 'border-destructive' : ''}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="hero"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Reset Password
                </>
              )}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              <Link
                to="/staff/login"
                className="hover:text-primary transition-colors"
              >
                Back to login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
