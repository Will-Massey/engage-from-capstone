/** Zero-token local routing — runs before any LLM call */

export type QuickIntentResult =
  | { handled: true; message: string; path?: string }
  | { handled: false };

const NAV_PATTERNS: Array<{ test: RegExp; path: string; message: string }> = [
  {
    test: /^(new|create)\s*proposal|start\s*proposal/i,
    path: '/proposals/new',
    message: 'Opening the proposal builder…',
  },
  {
    test: /^(my\s*)?proposals|view\s*proposals|open\s*proposals/i,
    path: '/proposals',
    message: 'Taking you to proposals…',
  },
  {
    test: /^(my\s*)?clients|view\s*clients/i,
    path: '/clients',
    message: 'Opening clients…',
  },
  {
    test: /^services|service\s*catalog/i,
    path: '/services',
    message: 'Opening your service catalogue…',
  },
  {
    test: /^settings|preferences/i,
    path: '/settings',
    message: 'Opening settings…',
  },
  {
    test: /^dashboard|home/i,
    path: '/',
    message: 'Back to dashboard…',
  },
  {
    test: /^help|what can you do/i,
    message:
      'Quick actions: create proposals, check proposal health, draft follow-ups, suggest services, and renewals. Open a proposal or client page for context-aware shortcuts.',
  },
];

export function matchLocalIntent(query: string): QuickIntentResult {
  const q = query.trim();
  if (!q) return { handled: false };

  for (const { test, path, message } of NAV_PATTERNS) {
    if (test.test(q)) {
      return path ? { handled: true, message, path } : { handled: true, message };
    }
  }

  return { handled: false };
}
