import {
  composeLetterBlocks,
  mergeProposalSeedIntoBlocks,
  moveLetterBlock,
  parseStoredLetterBlocks,
} from '../letterBlocks';

describe('composeLetterBlocks', () => {
  it('escapes HTML in a header block', () => {
    expect(composeLetterBlocks([{ type: 'header', content: 'A <B>' }])).toContain('A &lt;B&gt;');
  });
});

describe('moveLetterBlock', () => {
  it('swaps neighbours and no-ops at the edges', () => {
    const blocks = [
      { type: 'header' as const, content: 'A' },
      { type: 'body' as const, content: 'B' },
      { type: 'signoff' as const, content: 'C' },
    ];
    expect(moveLetterBlock(blocks, 0, -1)).toEqual(blocks);
    expect(moveLetterBlock(blocks, 0, 1).map((b) => b.content)).toEqual(['B', 'A', 'C']);
  });
});

describe('mergeProposalSeedIntoBlocks', () => {
  it('fills empty services/fees and inserts before signoff', () => {
    const merged = mergeProposalSeedIntoBlocks(
      [
        { type: 'header', content: 'Title' },
        { type: 'signoff', content: 'Yours faithfully,' },
      ],
      { services: 'Bookkeeping', fees: '£120 / month' }
    );
    expect(merged.map((b) => b.type)).toEqual(['header', 'services', 'fees', 'signoff']);
    expect(merged[1].content).toBe('Bookkeeping');
  });

  it('does not overwrite filled blocks', () => {
    const merged = mergeProposalSeedIntoBlocks(
      [{ type: 'services', content: 'Already set' }],
      { services: 'New', fees: '' }
    );
    expect(merged[0].content).toBe('Already set');
  });
});

describe('parseStoredLetterBlocks', () => {
  it('returns stored blocks', () => {
    expect(
      parseStoredLetterBlocks(JSON.stringify({ blocks: [{ type: 'body', content: 'Hi' }] }))
    ).toEqual([{ type: 'body', content: 'Hi' }]);
  });
});
