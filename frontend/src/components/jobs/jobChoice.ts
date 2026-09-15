export type JobChoiceOption = { value: string; label: string };

export function shouldPersistChoice(
  current: string | null | undefined,
  next: string | null | undefined
): boolean {
  return (current || '') !== (next || '');
}
