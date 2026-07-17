import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import AppRouteHeader from './AppRouteHeader';
import { initializeTheme } from '../../stores/themeStore';
import OnboardingTour from '../onboarding/OnboardingTour';
import { useOnboarding } from '../onboarding/useOnboarding';
import AiAssistant from '../ai/AiAssistant';
import { LegalFooterLinks } from '../legal/LegalPageLayout';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { showOnboarding, setShowOnboarding } = useOnboarding();

  useEffect(() => {
    initializeTheme();

    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-page overflow-x-clip">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 btn-primary text-sm"
      >
        Skip to content
      </a>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="lg:pl-72 xl:pl-80 min-w-0">
        {/* Header with glass effect — single instance, full dark support */}
        <div
          className={`fixed top-0 right-0 left-0 lg:left-72 xl:left-80 z-30 transition-all duration-300 pt-[env(safe-area-inset-top)] ${
            scrolled ? 'shadow-lg' : ''
          }`}
          style={{
            background: scrolled ? undefined : 'transparent',
            backdropFilter: scrolled ? 'blur(20px)' : 'none',
            WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
          }}
        >
          <div
            className={
              scrolled
                ? 'bg-white/90 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-700/80 backdrop-blur-xl'
                : 'bg-transparent border-b border-transparent'
            }
          >
            <Header onMenuClick={() => setSidebarOpen(true)} />
          </div>
        </div>

        {/* Main content area */}
        {/* pb-28 keeps the floating Clara launcher clear of the last row of content */}
        <main id="main-content" className="pt-20 pb-28 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto space-y-8">
            <AppRouteHeader />
            <Outlet />
            <footer className="pt-8 pb-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <LegalFooterLinks />
            </footer>
          </div>
        </main>
      </div>

      {/* Onboarding Tour */}
      <OnboardingTour isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* Global AI co-pilot */}
      <AiAssistant />
    </div>
  );
};

export default DashboardLayout;
