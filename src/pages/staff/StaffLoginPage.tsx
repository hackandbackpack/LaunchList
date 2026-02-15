import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { CONFIG } from '@/lib/config';
import logo from '@/assets/logo.png';

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function StaffLoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);

    const { error, mustChangePassword } = await signIn(data.email, data.password);

    if (error) {
      toast.error(error.message || 'Invalid credentials');
      setLoading(false);
      return;
    }

    const destination = mustChangePassword ? '/staff/change-password' : '/staff/dashboard';
    setTimeout(() => {
      navigate(destination);
    }, 500);
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
            <span className="text-gradient">Staff Login</span>
          </CardTitle>
          <CardDescription>
            Sign in to access the staff dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="staff@blastoffgaming.com"
                {...register('email')}
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/staff/forgot-password"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
                className={errors.password ? 'border-destructive' : ''}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
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
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <a href="/" className="hover:text-primary transition-colors">
              &larr; Back to home
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
