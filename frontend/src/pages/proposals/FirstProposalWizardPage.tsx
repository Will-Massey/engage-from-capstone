import { useNavigate } from 'react-router-dom';
import FirstProposalWizard from '../../components/onboarding/FirstProposalWizard';

/**
 * Standalone entry for the guided first-proposal wizard — always reachable
 * from Quick Start, e2e, and support links regardless of sent-proposal count.
 */
export default function FirstProposalWizardPage() {
  const navigate = useNavigate();

  return (
    <FirstProposalWizard open onClose={() => navigate('/')} onSent={() => navigate('/proposals')} />
  );
}
