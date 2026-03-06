import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { apiClient } from './utils/api';

// Layouts
import DashboardLayout from './components/layout/DashboardLayout';
import AuthLayout from './components/layout/AuthLayout';

// Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Onboarding from './pages/auth/Onboarding';
import Dashboard from './pages/Dashboard';
import Proposals from './pages/proposals/Proposals';
import ProposalDetail from './pages/proposals/ProposalDetail';
import CreateProposal from './pages/proposals/CreateProposal';
import Clients from './pages/clients/Clients';
import ClientDetail from './pages/clients/ClientDetail';
import CreateClient from './pages/clients/CreateClient';
import Services from './pages/services/Services';
import ServiceDetail from './pages/services/ServiceDetail';
import Settings from './pages/Settings';
import Subscription from './pages/Subscription';
import NotFound from './pages/NotFound';
import PublicProposalView from './pages/public/ProposalView';

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Public route wrapper (redirects to dashboard if authenticated)
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function App() {
  const { isAuthenticated, token, setAuth, clearAuth } = useAuthStore();

  // Validate token on app load
  useEffect(() => {
    const validateToken = async () => {
      if (!token) return;

      try {
        const response = await apiClient.getMe() as any;
        if (response.success) {
          setAuth(response.data.user, response.data.user.tenant, token);
        }
      } catch (error) {
        clearAuth();
      }
    };

    validateToken();
  }, []);

  return (
    <Routes>
      {/* Auth Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthLayout>
              <Login />
            </AuthLayout>
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <AuthLayout>
              <Onboarding />
            </AuthLayout>
          </PublicRoute>
        }
      />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        
        {/* Proposals */}
        <Route path="proposals" element={<Proposals />} />
        <Route path="proposals/new" element={<CreateProposal />} />
        <Route path="proposals/:id" element={<ProposalDetail />} />
        
        {/* Clients */}
        <Route path="clients" element={<Clients />} />
        <Route path="clients/new" element={<CreateClient />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        
        {/* Services */}
        <Route path="services" element={<Services />} />
        <Route path="services/:id" element={<ServiceDetail />} />
        
        {/* Settings */}
        <Route path="settings" element={<Settings />} />
        <Route path="subscription" element={<Subscription />} />
      </Route>

      {/* Public Proposal View (No authentication required) */}
      <Route path="/proposals/view/:token" element={<PublicProposalView />} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
