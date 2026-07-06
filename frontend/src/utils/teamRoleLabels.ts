export const TEAM_ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  PARTNER: 'Partner',
  MD: 'Managing Director',
  MANAGER: 'Manager',
  SENIOR: 'Senior',
  JUNIOR: 'Junior',
};

export const JOB_TITLE_PRESETS = [
  'Managing Director',
  'Partner',
  'Manager',
  'Senior Accountant',
  'Accountant',
  'Bookkeeper',
  'Practice Administrator',
] as const;

export function formatTeamRole(role: string): string {
  if (!role?.trim()) return '';
  const key = role.trim().toUpperCase();
  return TEAM_ROLE_LABELS[key] || role;
}
