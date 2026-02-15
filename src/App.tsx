import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";

import Index from "./pages/Index";
import SubmitPage from "./pages/SubmitPage";
import ConfirmationPage from "./pages/ConfirmationPage";
import StatusPage from "./pages/StatusPage";
import HelpPage from "./pages/HelpPage";
import StaffLoginPage from "./pages/staff/StaffLoginPage";
import StaffDashboard from "./pages/staff/StaffDashboard";
import StaffRequestDetail from "./pages/staff/StaffRequestDetail";
import ChangePasswordPage from "./pages/staff/ChangePasswordPage";
import ForgotPasswordPage from "./pages/staff/ForgotPasswordPage";
import ResetPasswordPage from "./pages/staff/ResetPasswordPage";
import AdminPage from "./pages/staff/AdminPage";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "./components/ErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/submit" element={<SubmitPage />} />
            <Route path="/confirmation/:orderNumber" element={<ConfirmationPage />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/staff/login" element={<StaffLoginPage />} />
            <Route path="/staff/dashboard" element={
              <ErrorBoundary fallbackMessage="The dashboard encountered an error.">
                <StaffDashboard />
              </ErrorBoundary>
            } />
            <Route path="/staff/request/:id" element={
              <ErrorBoundary fallbackMessage="Failed to load order details.">
                <StaffRequestDetail />
              </ErrorBoundary>
            } />
            <Route path="/staff/change-password" element={<ChangePasswordPage />} />
            <Route path="/staff/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/staff/reset-password" element={<ResetPasswordPage />} />
            <Route path="/staff/admin" element={
              <ErrorBoundary fallbackMessage="The admin panel encountered an error.">
                <AdminPage />
              </ErrorBoundary>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
