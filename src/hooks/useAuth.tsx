import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import api, { AuthUser, UserRole } from '@/integrations/api/client';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  role: UserRole | null;
  isStaff: boolean;
  isAdmin: boolean;
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; mustChangePassword?: boolean }>;
  signOut: () => Promise<void>;
  clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    // Check for existing session on mount
    api.auth.getSession()
      .then((response) => {
        if (response?.user) {
          setUser(response.user);
          setRole(response.user.role);
        }
      })
      .catch(() => {
        // Ignore errors, user is not authenticated
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await api.auth.login(email, password);
      setUser(response.user);
      setRole(response.user.role);
      const needsChange = response.mustChangePassword ?? false;
      setMustChangePassword(needsChange);
      return { error: null, mustChangePassword: needsChange };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Login failed') };
    }
  };

  const signOut = async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
      setRole(null);
      setMustChangePassword(false);
    }
  };

  const clearMustChangePassword = () => {
    setMustChangePassword(false);
  };

  const value = {
    user,
    loading,
    role,
    isStaff: role === 'staff' || role === 'admin',
    isAdmin: role === 'admin',
    mustChangePassword,
    signIn,
    signOut,
    clearMustChangePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
