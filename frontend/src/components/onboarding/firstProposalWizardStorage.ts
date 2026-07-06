const STORAGE_KEY = 'engage-wizard-dismissed';

export function isFirstProposalWizardDismissed(tenantId?: string): boolean {
  if (!tenantId) return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(parsed[tenantId]);
  } catch {
    return localStorage.getItem(STORAGE_KEY) === tenantId;
  }
}

export function dismissFirstProposalWizard(tenantId?: string): void {
  if (!tenantId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    parsed[tenantId] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    localStorage.setItem(STORAGE_KEY, tenantId);
  }
}

export function resetFirstProposalWizardDismissal(tenantId?: string): void {
  if (!tenantId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    delete parsed[tenantId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}
