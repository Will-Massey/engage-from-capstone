/**
 * Pure typed-signature rendering — takes any canvas satisfying the structural
 * interface so unit tests can inject a fake (happy-dom has no 2D context).
 */

export const TYPED_SIGNATURE_FONT = '"Dancing Script", cursive';
/** FontFaceSet.load() spec string for preloading before first render. */
export const TYPED_SIGNATURE_FONT_LOAD = '48px "Dancing Script"';

export interface TypedSignatureContext {
  font: string;
  fillStyle: string;
  textAlign: string;
  textBaseline: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

export interface TypedSignatureCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d'): TypedSignatureContext | null;
  toDataURL(type: string): string;
}

/**
 * Draw `name` centred on the canvas in the bundled cursive font and return a
 * PNG data-URL (same contract as SignaturePad's onSave payload). Blank names
 * clear the canvas and return '' so callers can treat it as "no signature".
 */
export function renderTypedSignature(canvas: TypedSignatureCanvas, name: string): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const trimmed = name.trim();
  if (!trimmed) return '';

  // Scale the font down for long names so the signature always fits.
  const size = Math.min(
    64,
    Math.max(28, Math.floor((canvas.width * 1.6) / Math.max(trimmed.length, 1)))
  );
  ctx.font = `${size}px ${TYPED_SIGNATURE_FONT}`;
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(trimmed, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL('image/png');
}
