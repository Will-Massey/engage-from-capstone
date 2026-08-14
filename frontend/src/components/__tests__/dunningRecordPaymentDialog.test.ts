import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The Record-payment dialog must be portaled to document.body.
 *
 * metal.css forces every direct child of .metal-tile to
 * `position: relative; z-index: 1` (the selector's :not() clauses give it
 * specificity 0,3,0, which beats Tailwind's .fixed at 0,1,0). A dialog
 * rendered as a direct child of the tile therefore loses position: fixed and
 * appears in normal flow at the bottom of the tile — below the fold on any
 * tenant with a long collection queue. Caroline at Fortis pressed "Record
 * payment" and nothing visibly happened; prod logs showed the request was
 * never sent because the form was never seen.
 *
 * The tile's `isolation: isolate` would also trap the overlay's z-index
 * beneath later dashboard sections even if specificity were fixed, so the
 * only safe home for the dialog is a portal — the same idiom Settings.tsx
 * uses for its team-member modals.
 */
describe('DunningQueue record-payment dialog', () => {
  const source = readFileSync(resolve(__dirname, '../analytics/DunningQueue.tsx'), 'utf8');

  it('portals the dialog to document.body', () => {
    expect(source).toContain("import { createPortal } from 'react-dom'");
    expect(source).toMatch(/createPortal\(/);
    expect(source).toMatch(/document\.body\s*\)/);
  });

  it('shows failures inside the open dialog, not behind the overlay', () => {
    // On error the dialog stays open; a message rendered only in the tile
    // sits behind the overlay and reads as "nothing happened".
    const dialog = source.slice(source.indexOf('createPortal('));
    expect(dialog).toContain('{msg && (');
  });
});
