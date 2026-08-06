import { describe, expect, it } from 'vitest';
import { renderTypedSignature } from '../typedSignature';
import { collectSignatureValidationErrors } from '../../../pages/public/publicSigning';

function makeFakeCanvas() {
  const calls: string[] = [];
  const ctx = {
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    clearRect: (..._args: number[]) => calls.push('clearRect'),
    fillText: (text: string, _x: number, _y: number) => calls.push(`fillText:${text}`),
  };
  const canvas = {
    width: 600,
    height: 200,
    getContext: (_id: '2d') => ctx,
    toDataURL: (_type: string) => 'data:image/png;base64,typedsig',
  };
  return { canvas, ctx, calls };
}

describe('renderTypedSignature', () => {
  it('draws the trimmed name in the cursive font and returns a PNG data-URL', () => {
    const { canvas, ctx, calls } = makeFakeCanvas();
    const dataUrl = renderTypedSignature(canvas, '  Jane Client  ');
    expect(dataUrl).toBe('data:image/png;base64,typedsig');
    expect(calls).toEqual(['clearRect', 'fillText:Jane Client']);
    expect(ctx.font).toContain('Dancing Script');
    expect(ctx.textAlign).toBe('center');
  });

  it('returns empty string for blank input without drawing text', () => {
    const { canvas, calls } = makeFakeCanvas();
    expect(renderTypedSignature(canvas, '   ')).toBe('');
    expect(calls).toEqual(['clearRect']);
  });

  it('round-trips through signature validation', () => {
    const { canvas } = makeFakeCanvas();
    const dataUrl = renderTypedSignature(canvas, 'Jane Client');
    const errors = collectSignatureValidationErrors({
      signatureData: dataUrl,
      signerName: 'Jane Client',
      signerRole: 'Director',
      signerEmail: 'jane@acme.test',
      consentAccepted: true,
    });
    expect(errors).toEqual([]);
  });
});
