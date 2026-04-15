import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';

export const useOnboarding = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    // Check if user is new (joined within last 7 days) and hasn't completed onboarding
    const onboardingCompleted = localStorage.getItem('onboardingCompleted');
    const onboardingDismissed = localStorage.getItem('onboardingDismissed');

    if (user && !onboardingCompleted && !onboardingDismissed && user.createdAt) {
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

  return { showOnboarding, setShowOnboarding };
};
