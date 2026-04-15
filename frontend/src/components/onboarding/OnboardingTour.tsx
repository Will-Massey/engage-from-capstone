interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
}

// Placeholder component - onboarding tour temporarily disabled
const OnboardingTour = ({ isOpen, onClose }: OnboardingTourProps) => {
  // Component disabled due to React error #130 with react-joyride in production
  return null;
};

export default OnboardingTour;
