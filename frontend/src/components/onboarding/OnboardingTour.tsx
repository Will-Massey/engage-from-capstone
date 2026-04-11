import { useEffect, useState, useCallback } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import type { Step, Styles } from 'react-joyride';
import { useAuthStore } from '../../stores/authStore';

// Type definitions
interface CallBackProps {
  action: string;
  index: number;
  status: string;
  type: string;
}

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
}

const OnboardingTour = ({ isOpen, onClose }: OnboardingTourProps) => {
  const { user } = useAuthStore();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Define tour steps
  const steps: Step[] = [
    {
      target: 'body',
      content: (
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Welcome to Engage! 👋
          </h3>
          <p className="text-slate-600">
            Let's take a quick tour to help you get started with creating professional proposals.
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour="dashboard"]',
      content: (
        <div>
          <h4 className="font-semibold text-slate-900 mb-1">Dashboard</h4>
          <p className="text-sm text-slate-600">
            Your command center. See all your proposals, recent activity, and quick stats at a glance.
          </p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="proposals"]',
      content: (
        <div>
          <h4 className="font-semibold text-slate-900 mb-1">Proposals</h4>
          <p className="text-sm text-slate-600">
            Create, send, and track all your proposals. Filter by status, search, and manage everything in one place.
          </p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="clients"]',
      content: (
        <div>
          <h4 className="font-semibold text-slate-900 mb-1">Clients</h4>
          <p className="text-sm text-slate-600">
            Manage your client database. Add new clients, track MTD ITSA status, and view their proposal history.
          </p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="services"]',
      content: (
        <div>
          <h4 className="font-semibold text-slate-900 mb-1">Services</h4>
          <p className="text-sm text-slate-600">
            Your service catalog. Set up your offerings with pricing, descriptions, and billing frequencies.
          </p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="analytics"]',
      content: (
        <div>
          <h4 className="font-semibold text-slate-900 mb-1">Analytics</h4>
          <p className="text-sm text-slate-600">
            Track your performance. See conversion rates, revenue trends, and which services are most popular.
          </p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="create-proposal"]',
      content: (
        <div>
          <h4 className="font-semibold text-slate-900 mb-1">Create Your First Proposal</h4>
          <p className="text-sm text-slate-600">
            Ready to go? Click here to create your first professional proposal in under 5 minutes!
          </p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="command-palette"]',
      content: (
        <div>
          <h4 className="font-semibold text-slate-900 mb-1">Command Palette</h4>
          <p className="text-sm text-slate-600">
            Pro tip: Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">Cmd</kbd> + <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">K</kbd> (or <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">K</kbd>) anytime to search and navigate quickly.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: 'body',
      content: (
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            You're all set! 🎉
          </h3>
          <p className="text-slate-600 mb-4">
            You can always restart this tour from Settings if you need a refresher.
          </p>
          <p className="text-sm text-slate-500">
            Happy proposing!
          </p>
        </div>
      ),
      placement: 'center',
    },
  ];

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { action, index, status, type } = data;

    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any)) {
      setRun(false);
      setStepIndex(0);
      onClose();
      
      // Mark tour as completed in localStorage
      localStorage.setItem('onboardingCompleted', 'true');
      localStorage.setItem('onboardingCompletedAt', new Date().toISOString());
    } else if (action === 'next' && type === 'step:after') {
      setStepIndex(index + 1);
    } else if (action === 'prev' && type === 'step:after') {
      setStepIndex(index - 1);
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM elements are rendered
      const timer = setTimeout(() => {
        setRun(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setRun(false);
    }
  }, [isOpen]);

  const joyrideStyles: Styles = {
    options: {
      zIndex: 10000,
      primaryColor: '#0ea5e9',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      arrowColor: 'rgba(255, 255, 255, 0.95)',
      textColor: '#0f172a',
      overlayColor: 'rgba(0, 0, 0, 0.5)',
      beaconSize: 36,
    },
    tooltip: {
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: '16px',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.5)',
      padding: '24px',
    },
    tooltipContainer: {
      textAlign: 'left',
    },
    tooltipTitle: {
      fontSize: '16px',
      fontWeight: 600,
      marginBottom: '8px',
    },
    tooltipContent: {
      fontSize: '14px',
      lineHeight: '1.5',
    },
    buttonNext: {
      backgroundColor: '#0ea5e9',
      borderRadius: '8px',
      color: '#fff',
      fontSize: '14px',
      fontWeight: 500,
      padding: '8px 16px',
    },
    buttonBack: {
      color: '#64748b',
      fontSize: '14px',
      marginRight: '12px',
    },
    buttonSkip: {
      color: '#64748b',
      fontSize: '14px',
    },
    buttonClose: {
      color: '#64748b',
    },
    spotlight: {
      backgroundColor: 'transparent',
      borderRadius: '8px',
      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
    },
  };

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      hideCloseButton
      hideBackButton={stepIndex === 0}
      run={run}
      scrollToFirstStep
      showProgress
      showSkipButton
      stepIndex={stepIndex}
      steps={steps}
      styles={joyrideStyles}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip Tour',
      }}
    />
  );
};

// Hook to check if user should see onboarding
export const useOnboarding = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    // Check if user is new (joined within last 7 days) and hasn't completed onboarding
    const onboardingCompleted = localStorage.getItem('onboardingCompleted');
    const onboardingDismissed = localStorage.getItem('onboardingDismissed');
    
    if (user && !onboardingCompleted && !onboardingDismissed) {
      const accountAge = Date.now() - new Date(user.createdAt).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      if (accountAge < sevenDays) {
        // Delay showing the tour by 1 second to let the UI load
        const timer = setTimeout(() => {
          setShowOnboarding(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [user]);

  const dismissOnboarding = () => {
    localStorage.setItem('onboardingDismissed', 'true');
    setShowOnboarding(false);
  };

  const restartOnboarding = () => {
    localStorage.removeItem('onboardingCompleted');
    localStorage.removeItem('onboardingDismissed');
    setShowOnboarding(true);
  };

  return {
    showOnboarding,
    setShowOnboarding,
    dismissOnboarding,
    restartOnboarding,
  };
};

export default OnboardingTour;
