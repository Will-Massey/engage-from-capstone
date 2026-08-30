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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function composeLetterBlocks(blocks: LetterBlock[]): string {
  const parts = blocks.map((block) => {
    const html = escapeHtml(block.content).replace(/\n/g, '<br/>');
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

export function seedBlocksFromLetter(title: string, bodyHtml: string, reason?: string): LetterBlock[] {
  if (typeof document !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.innerHTML = bodyHtml || '';
    const text = tmp.textContent || '';
    return [
      { type: 'header', content: title || '' },
      { type: 'body', content: text.slice(0, 1500) },
      { type: 'clauses', content: reason || '' },
      { type: 'signoff', content: 'Yours faithfully,' },
    ];
  }
  return [
    { type: 'header', content: title || '' },
    { type: 'body', content: '' },
    { type: 'clauses', content: reason || '' },
    { type: 'signoff', content: 'Yours faithfully,' },
  ];
}

export function moveLetterBlock(blocks: LetterBlock[], index: number, delta: -1 | 1): LetterBlock[] {
  const next = index + delta;
  if (next < 0 || next >= blocks.length) return blocks;
  const copy = [...blocks];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}
