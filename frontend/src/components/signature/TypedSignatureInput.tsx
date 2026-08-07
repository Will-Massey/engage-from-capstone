import { useEffect, useRef, useState } from 'react';
import '@fontsource/dancing-script/400.css';
import { renderTypedSignature, TYPED_SIGNATURE_FONT_LOAD } from './typedSignature';

interface TypedSignatureInputProps {
  onSave: (signatureData: string) => void;
  onClear?: () => void;
  height?: number;
}

/**
 * Type-to-sign input: the signer types their name and it renders live onto a
 * canvas in the bundled cursive font, producing the same PNG data-URL contract
 * as SignaturePad.
 */
const TypedSignatureInput = ({ onSave, onClear, height = 160 }: TypedSignatureInputProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [typedName, setTypedName] = useState('');
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Preload the cursive face so the first render is already styled.
    // document.fonts is undefined in some test environments — treat as ready.
    const fonts = (document as { fonts?: FontFaceSet }).fonts;
    if (!fonts) {
      setFontReady(true);
      return;
    }
    fonts
      .load(TYPED_SIGNATURE_FONT_LOAD)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setFontReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fontReady) return;
    const dataUrl = renderTypedSignature(canvas, typedName);
    if (dataUrl) {
      onSave(dataUrl);
    } else {
      onClear?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- render on name/font change only
  }, [typedName, fontReady]);

  return (
    <div className="space-y-3">
      <input
        data-testid="typed-signature-input"
        type="text"
        value={typedName}
        onChange={(e) => setTypedName(e.target.value)}
        placeholder="Type your full name"
        autoComplete="name"
        className="input-field w-full"
      />
      <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 overflow-hidden">
        <canvas
          data-testid="typed-signature-canvas"
          ref={canvasRef}
          width={600}
          height={height}
          className="w-full"
          style={{ height }}
          aria-label="Typed signature preview"
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Typing your name creates a legally valid electronic signature.
      </p>
    </div>
  );
};

export default TypedSignatureInput;
