import {
  composeLetterBlocks,
  parseStoredLetterBlocks,
} from '../practiceLetterBlocks.js';

describe('composeLetterBlocks', () => {
  it('escapes HTML and labels services / fees / clauses', () => {
    const html = composeLetterBlocks([
      { type: 'header', content: 'Fortis <Ltd>' },
      { type: 'services', content: 'Bookkeeping\nVAT' },
      { type: 'fees', content: '£120 / month' },
      { type: 'signoff', content: 'Yours faithfully,' },
    ]);
    expect(html).toContain('Fortis &lt;Ltd&gt;');
    expect(html).toContain('<strong>Services</strong>');
    expect(html).toContain('Bookkeeping<br/>VAT');
    expect(html).toContain('<strong>Fees</strong>');
    expect(html).toContain('Yours faithfully,');
  });
});

describe('parseStoredLetterBlocks', () => {
  it('reads valid blocks and ignores junk', () => {
    expect(
      parseStoredLetterBlocks(
        JSON.stringify({
          blocks: [
            { type: 'header', content: 'Title' },
            { type: 'nope', content: 'x' },
            { type: 'body', content: 'Hello' },
          ],
        })
      )
    ).toEqual([
      { type: 'header', content: 'Title' },
      { type: 'body', content: 'Hello' },
    ]);
    expect(parseStoredLetterBlocks('{"reason":"x"}')).toBeNull();
  });
});
