import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
import EditProposal from './pages/proposals/EditProposal';
import Clients from './pages/clients/Clients';
import ClientDetail from './pages/clients/ClientDetail';
import CreateClient from './pages/clients/CreateClient';
import Services from './pages/services/Services';
import ServiceDetail from './pages/services/ServiceDetail';
import Settings from './pages/Settings';
import Subscription from './pages/Subscription';
import Analytics from './pages/Analytics';
import NotFound from './pages/NotFound';
import PublicProposalView from './pages/public/ProposalView';
import ClientPortal from './pages/public/ClientPortal';

// World-class features
import CommandPalette from './components/command-palette/CommandPalette';
import KeyboardShortcuts from './components/keyboard/KeyboardShortcuts';
import useCommandPalette from './hooks/useCommandPalette';

// Page transition variants
const pageVariants = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1] as const,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
    },
  },
};

// Animated page wrapper
const AnimatedPage = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial="initial"
    animate="animate"
    exit="exit"
    variants={pageVariants}
    className="h-full"
  >
    {children}
  </motion.div>
);

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

// Animated routes component
const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Auth Routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <AuthLayout>
                <AnimatedPage>
                  <Login />
                </AnimatedPage>
              </AuthLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <AuthLayout>
                <AnimatedPage>
                  <Onboarding />
                </AnimatedPage>
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
          <Route
            index
            element={
              <AnimatedPage>
                <Dashboard />
              </AnimatedPage>
            }
          />

          {/* Proposals */}
          <Route
            path="proposals"
            element={
              <AnimatedPage>
                <Proposals />
              </AnimatedPage>
            }
          />
          <Route
            path="proposals/new"
            element={
              <AnimatedPage>
                <CreateProposal />
              </AnimatedPage>
            }
          />
          <Route
            path="proposals/:id/edit"
            element={
              <AnimatedPage>
                <EditProposal />
              </AnimatedPage>
            }
          />
          <Route
            path="proposals/:id"
            element={
              <AnimatedPage>
                <ProposalDetail />
              </AnimatedPage>
            }
          />

          {/* Clients */}
          <Route
            path="clients"
            element={
              <AnimatedPage>
                <Clients />
              </AnimatedPage>
            }
          />
          <Route
            path="clients/new"
            element={
              <AnimatedPage>
                <CreateClient />
              </AnimatedPage>
            }
          />
          <Route
            path="clients/:id"
            element={
              <AnimatedPage>
                <ClientDetail />
              </AnimatedPage>
            }
          />

          {/* Services */}
          <Route
            path="services"
            element={
              <AnimatedPage>
                <Services />
              </AnimatedPage>
            }
          />
          <Route
            path="services/:id"
            element={
              <AnimatedPage>
                <ServiceDetail />
              </AnimatedPage>
            }
          />

          {/* Settings */}
          <Route
            path="settings"
            element={
              <AnimatedPage>
                <Settings />
              </AnimatedPage>
            }
          />
          <Route
            path="subscription"
            element={
              <AnimatedPage>
                <Subscription />
              </AnimatedPage>
            }
          />
          <Route
            path="analytics"
            element={
              <AnimatedPage>
                <Analytics />
              </AnimatedPage>
            }
          />
        </Route>

        {/* Public Proposal View (link possession = access) */}
        <Route
          path="/proposals/view/:token"
          element={
            <AnimatedPage>
              <PublicProposalView />
            </AnimatedPage>
          }
        />

        {/* Client Portal (link possession = access) */}
        <Route
          path="/portal/:token"
          element={
            <AnimatedPage>
              <ClientPortal />
            </AnimatedPage>
          }
        />

        {/* 404 */}
        <Route
          path="*"
          element={
            <AnimatedPage>
              <NotFound />
            </AnimatedPage>
          }
        />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  const { isAuthenticated, token, setAuth, clearAuth } = useAuthStore();
  const { isOpen: isCommandPaletteOpen, close: closeCommandPalette, toggle: toggleCommandPalette } =
    useCommandPalette();
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Validate token on app load
  useEffect(() => {
    const validateToken = async () => {
      if (!token) return;

      try {
        const response = (await apiClient.getMe()) as any;
        if (response.success) {
          setAuth(response.data.user, response.data.user.tenant, token);
        }
      } catch (error) {
        clearAuth();
      }
    };

    validateToken();
  }, [token, setAuth, clearAuth]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isAuthenticated) toggleCommandPalette();
        return;
      }

      // ? to open keyboard shortcuts (when not in input)
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        if (!isInput && isAuthenticated) {
          e.preventDefault();
          setIsShortcutsOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, toggleCommandPalette]);

  return (
    <>
      <AnimatedRoutes />

      {/* World-class features - only for authenticated users */}
      {isAuthenticated && (
        <>
          <CommandPalette isOpen={isCommandPaletteOpen} onClose={closeCommandPalette} />
          <KeyboardShortcuts isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
        </>
      )}
    </>
  );
}

export default App;
