import { useState, useEffect } from 'react';

const TOUR_STEPS = [
  {
    title: 'Welcome to Engage',
    body: 'Create compliant proposals in minutes, share them securely, and let automation nurture clients after acceptance.',
  },
  {
    title: 'Command palette',
    body: 'Press Ctrl+K (or Cmd+K) anywhere to jump to proposals, clients, or create something new.',
  },
  {
    title: 'Automated touchpoints',
    body: 'After a proposal is accepted, Engage sends lifecycle emails automatically. Manage templates under Settings → Automation.',
  },
];

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
}

const OnboardingTour = ({ isOpen, onClose }: OnboardingTourProps) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isOpen) setStep(0);
  }, [isOpen]);

  if (!isOpen) return null;

  const current = TOUR_STEPS[step];
  const isLast = step >= TOUR_STEPS.length - 1;

  const finish = () => {
    localStorage.setItem('onboardingCompleted', 'true');
    onClose();
  };

  const dismiss = () => {
    localStorage.setItem('onboardingDismissed', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={dismiss}
        aria-hidden
      />
      <div
        className="relative w-full max-w-md glass-tile p-6 shadow-2xl animate-fade-in"
        role="dialog"
        aria-labelledby="onboarding-tour-title"
        aria-modal="true"
      >
        <p className="text-xs font-medium text-primary-600 uppercase tracking-wider">
          Step {step + 1} of {TOUR_STEPS.length}
        </p>
        <h2
          id="onboarding-tour-title"
          className="mt-2 text-xl font-semibold text-slate-900 dark:text-white"
        >
          {current.title}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {current.body}
        </p>
        <div className="mt-6 flex flex-wrap gap-2 justify-between">
          <button
            type="button"
            onClick={dismiss}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="btn-secondary text-sm"
              >
                Back
              </button>
            )}
            {isLast ? (
              <button type="button" onClick={finish} className="btn-primary text-sm">
                Get started
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="btn-primary text-sm"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
