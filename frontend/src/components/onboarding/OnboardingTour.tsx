// Temporarily disabled - causing React error #130 in production
// import { Joyride, STATUS } from 'react-joyride';
// import type { Step, Styles } from 'react-joyride';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
}

// Placeholder component - onboarding tour temporarily disabled
const OnboardingTour = ({ isOpen, onClose }: OnboardingTourProps) => {
  // Component disabled due to React error #130 with react-joyride in production
  return null;
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
