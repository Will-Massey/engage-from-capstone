import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The Clara wizard (/proposals/wizard) cannot advance without an auto-fit
 * result, so a practice that lands there has no way to build a proposal by
 * hand. The builder (/proposals/new) offers manual, template or Clara as a
 * first-class choice.
 *
 * Caroline at Fortis hit this: every generic "create a proposal" affordance
 * pointed at the wizard, so the manual builder was only reachable from a
 * client or service page. These files must keep sending people to the chooser.
 *
 * Surfaces that *name* the wizard are deliberately excluded — an honest,
 * labelled shortcut is a choice, not a trap.
 */
const GENERIC_CREATE_SURFACES = [
  'components/layout/Header.tsx',
  'pages/proposals/Proposals.tsx',
  'components/empty-states/EmptyStates.tsx',
];

const readSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, '../..', relativePath), 'utf8');

describe('generic create-proposal entry points', () => {
  it.each(GENERIC_CREATE_SURFACES)('%s does not send people to the Clara wizard', (file) => {
    expect(readSource(file)).not.toContain('/proposals/wizard');
  });

  it.each(GENERIC_CREATE_SURFACES)('%s links to the builder instead', (file) => {
    expect(readSource(file)).toContain('/proposals/new');
  });

  it('the wizard offers a way out to the manual builder', () => {
    const wizard = readSource('components/proposals/ProposalWizard.tsx');
    expect(wizard).toContain('/proposals/new?manual=1');
  });
});
