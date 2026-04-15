import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { initializeTheme } from '../../stores/themeStore';
import OnboardingTour from '../onboarding/OnboardingTour';
import { useOnboarding } from '../onboarding/useOnboarding';

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
    <div className="min-h-screen bg-gradient-page">
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
      <div className="lg:pl-72">
        {/* Header with glass effect */}
        <div
          className={`fixed top-0 right-0 left-0 lg:left-72 z-30 transition-all duration-300 ${
            scrolled ? 'shadow-lg' : ''
          }`}
          style={{
            background: scrolled
              ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.85) 100%)'
              : 'transparent',
            backdropFilter: scrolled ? 'blur(20px)' : 'none',
            WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
            borderBottom: scrolled ? '1px solid rgba(226, 232, 240, 0.8)' : 'none',
          }}
        >
          <div className="dark:hidden">
            <Header onMenuClick={() => setSidebarOpen(true)} />
          </div>
          <div
            className="hidden dark:block"
            style={{
              background: scrolled
                ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(15, 23, 42, 0.85) 100%)'
                : 'transparent',
              borderBottom: scrolled ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
            }}
          >
            <Header onMenuClick={() => setSidebarOpen(true)} />
          </div>
        </div>

        {/* Main content area */}
        <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Onboarding Tour */}
      <OnboardingTour isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
};

export default DashboardLayout;
