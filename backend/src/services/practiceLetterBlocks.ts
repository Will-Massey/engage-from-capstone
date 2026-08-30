export const LETTER_BLOCK_TYPES = [
  'header',
  'body',
  'services',
  'fees',
  'clauses',
  'signoff',
] as const;

export type LetterBlockType = (typeof LETTER_BLOCK_TYPES)[number];

export type LetterBlock = {
  type: LetterBlockType;
  content: string;
};

export function escapeLetterHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function composeLetterBlocks(blocks: LetterBlock[]): string {
  const parts = blocks.map((block) => {
    const html = escapeLetterHtml(block.content).replace(/\n/g, '<br/>');
    switch (block.type) {
      case 'header':
        return `<div class="letter-block letter-header"><p><strong>${html}</strong></p></div>`;
      case 'services':
        return `<div class="letter-block letter-services"><p><strong>Services</strong></p><p>${html}</p></div>`;
      case 'fees':
        return `<div class="letter-block letter-fees"><p><strong>Fees</strong></p><p>${html}</p></div>`;
      case 'clauses':
        return `<div class="letter-block letter-clauses"><p><strong>Clauses</strong></p><p>${html}</p></div>`;
      case 'signoff':
        return `<div class="letter-block letter-signoff"><p>${html}</p></div>`;
      default:
        return `<div class="letter-block letter-body"><p>${html}</p></div>`;
    }
  });
  return `<div class="practice-letter">${parts.join('\n')}</div>`;
}

export function parseStoredLetterBlocks(metaJson?: string | null): LetterBlock[] | null {
  try {
    const meta = JSON.parse(metaJson || '{}') as { blocks?: unknown };
    if (!Array.isArray(meta.blocks)) return null;
    const blocks = meta.blocks
      .filter((b): b is LetterBlock => {
        return (
          !!b &&
          typeof b === 'object' &&
          LETTER_BLOCK_TYPES.includes((b as LetterBlock).type) &&
          typeof (b as LetterBlock).content === 'string'
        );
      })
      .slice(0, 20);
    return blocks.length ? blocks : null;
  } catch {
    return null;
  }
}
