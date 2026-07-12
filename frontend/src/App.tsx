import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from './stores/authStore';
import { apiClient, ensureCsrfReady, hydrateCsrfCache, rememberCsrfToken } from './utils/api';
import { appRelativePath } from './utils/appBase';

// Layouts (kept eager — lightweight shells shared across routes)
import DashboardLayout from './components/layout/DashboardLayout';
import AuthLayout from './components/layout/AuthLayout';
import { PageSuspense } from './components/layout/PageSuspense';

import * as Pages from './routes/lazyPages';

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
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

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
                  <PageSuspense>
                    <Pages.Login />
                  </PageSuspense>
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
                  <PageSuspense>
                    <Pages.Onboarding />
                  </PageSuspense>
                </AnimatedPage>
              </AuthLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <AuthLayout>
                <AnimatedPage>
                  <PageSuspense>
                    <Pages.ForgotPassword />
                  </PageSuspense>
                </AnimatedPage>
              </AuthLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <PublicRoute>
              <AuthLayout>
                <AnimatedPage>
                  <PageSuspense>
                    <Pages.ResetPassword />
                  </PageSuspense>
                </AnimatedPage>
              </AuthLayout>
            </PublicRoute>
          }
        />
        <Route
          path="/verify-email"
          element={
            <PublicRoute>
              <AuthLayout>
                <AnimatedPage>
                  <PageSuspense>
                    <Pages.VerifyEmail />
                  </PageSuspense>
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
                <PageSuspense>
                  <Pages.Dashboard />
                </PageSuspense>
              </AnimatedPage>
            }
          />

          {/* Proposals */}
          <Route
            path="proposals"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.Proposals />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="proposals/wizard"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.WizardProposal />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="proposals/new"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.CreateProposal />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="proposals/renewals"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.BulkRenewalWizard />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="proposals/first-wizard"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.FirstProposalWizardPage />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="proposals/:id/edit"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.EditProposal />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="proposals/:id"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.ProposalDetail />
                </PageSuspense>
              </AnimatedPage>
            }
          />

          {/* Clients */}
          <Route
            path="clients"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.Clients />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="clients/new"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.CreateClient />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="clients/:id"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.ClientDetail />
                </PageSuspense>
              </AnimatedPage>
            }
          />

          {/* Catalogue */}
          <Route
            path="templates"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.ProposalTemplates />
                </PageSuspense>
              </AnimatedPage>
            }
          />

          {/* Services */}
          <Route
            path="services"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.Services />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="services/:id"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.ServiceDetail />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="pricing-calculator"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.PricingCalculatorPage />
                </PageSuspense>
              </AnimatedPage>
            }
          />

          {/* Settings */}
          <Route
            path="settings"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.Settings />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="2fa-setup"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.TwoFactorSetup />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="subscription"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.Subscription />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="analytics"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.Analytics />
                </PageSuspense>
              </AnimatedPage>
            }
          />
          <Route
            path="partners"
            element={
              <AnimatedPage>
                <PageSuspense>
                  <Pages.PartnerProgramme />
                </PageSuspense>
              </AnimatedPage>
            }
          />
        </Route>

        {/* Public status page (W4.5) */}
        <Route
          path="/status"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.Status />
              </PageSuspense>
            </AnimatedPage>
          }
        />

        {/* Public Proposal View (link possession = access) */}
        <Route
          path="/proposals/view/:token"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.PublicProposalView />
              </PageSuspense>
            </AnimatedPage>
          }
        />

        {/* Client Portal (link possession = access) */}
        <Route
          path="/portal/:token"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.ClientPortal />
              </PageSuspense>
            </AnimatedPage>
          }
        />

        {/* AML self-service form (portal token) */}
        <Route
          path="/onboarding/aml/:token"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.AmlOnboarding />
              </PageSuspense>
            </AnimatedPage>
          }
        />

        {/* Legal pages (public) */}
        <Route
          path="/legal/terms"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.TermsOfService />
              </PageSuspense>
            </AnimatedPage>
          }
        />
        <Route
          path="/legal/payment-collection-terms"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.PaymentCollectionTerms />
              </PageSuspense>
            </AnimatedPage>
          }
        />
        <Route
          path="/legal/client-payment-authorisation"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.ClientPaymentAuthorisation />
              </PageSuspense>
            </AnimatedPage>
          }
        />
        <Route
          path="/legal/privacy"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.PrivacyPolicy />
              </PageSuspense>
            </AnimatedPage>
          }
        />
        <Route
          path="/legal/ai-disclosure"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.AiDisclosure />
              </PageSuspense>
            </AnimatedPage>
          }
        />
        <Route
          path="/legal/soc2"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.Soc2Controls />
              </PageSuspense>
            </AnimatedPage>
          }
        />

        {/* 404 */}
        <Route
          path="*"
          element={
            <AnimatedPage>
              <PageSuspense>
                <Pages.NotFound />
              </PageSuspense>
            </AnimatedPage>
          }
        />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  const { isAuthenticated, setSession, clearAuth, setLoading } = useAuthStore();
  const {
    isOpen: isCommandPaletteOpen,
    close: closeCommandPalette,
    toggle: toggleCommandPalette,
  } = useCommandPalette();
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Restore session from httpOnly cookies via /me (skip on login/register to avoid refresh noise)
  useEffect(() => {
    const bootstrapSession = async () => {
      const path = appRelativePath();
      const skipBootstrap =
        path === '/login' ||
        path === '/register' ||
        path.startsWith('/forgot-password') ||
        path.startsWith('/reset-password') ||
        path.startsWith('/verify-email');

      if (skipBootstrap) {
        clearAuth();
        setLoading(false);
        return;
      }

      hydrateCsrfCache();
      setLoading(true);
      try {
        const response = (await apiClient.getMe()) as any;
        if (response.success) {
          rememberCsrfToken(response.data.csrfToken);
          setSession(response.data.user, response.data.user.tenant);
          await ensureCsrfReady();
        } else {
          clearAuth();
        }
      } catch {
        clearAuth();
      } finally {
        setLoading(false);
      }
    };

    bootstrapSession();
  }, [setSession, clearAuth, setLoading]);

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
