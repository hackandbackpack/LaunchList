import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CONFIG } from '@/lib/config';
import api from '@/integrations/api/client';
import logo from '@/assets/logo.png';

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setLoading(true);
    try {
      await api.auth.requestPasswordReset(data.email);
    } catch {
      // Always show success to prevent email enumeration
    } finally {
      setLoading(false);
      setSubmitted(true);
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
            <span className="text-gradient">Reset Password</span>
          </CardTitle>
          <CardDescription>
            {submitted
              ? 'Check your email for a reset link'
              : 'Enter your email to receive a password reset link'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                If an account exists with that email, we've sent a password reset link.
                The link expires in 1 hour.
              </p>
              <div className="text-center">
                <Link
                  to="/staff/login"
                  className="text-sm text-primary hover:underline"
                >
                  Back to login
                </Link>
              </div>
            </div>
          ) : (
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

              <Button
                type="submit"
                variant="hero"
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Reset Link
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
