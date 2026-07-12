import { useRef, useState, useEffect, useCallback } from 'react';
import {
  clampDevicePixelRatio,
  computeFullWidthCanvasSize,
  getCanvasMetrics,
  getGuidelineOffsets,
} from './signaturePadGeometry';

interface SignaturePadProps {
  onSave: (signatureData: string) => void;
  onClear?: () => void;
  width?: number;
  height?: number;
  disabled?: boolean;
  fullWidth?: boolean;
  /**
   * Hide the internal "Confirm Signature" button. onSave fires automatically
   * at the end of each stroke instead, so the parent can render a single
   * confirm action of its own.
   */
  hideConfirm?: boolean;
}

const SignaturePad = ({
  onSave,
  onClear,
  width = 600,
  height = 200,
  disabled = false,
  fullWidth = false,
  hideConfirm = false,
}: SignaturePadProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width, height });

  useEffect(() => {
    if (!fullWidth) {
      setCanvasSize({ width, height });
      return;
    }

    const updateSize = () => {
      const containerWidth = containerRef.current?.clientWidth || width;
      setCanvasSize(computeFullWidthCanvasSize(containerWidth));
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [fullWidth, width, height]);

  // Scale the backing store for crisp strokes on HiDPI/retina screens while
  // keeping the CSS size (and stroke coordinates) in CSS pixels.
  const dpr = clampDevicePixelRatio(
    typeof window !== 'undefined' ? window.devicePixelRatio : undefined
  );
  const metrics = getCanvasMetrics(canvasSize.width, canvasSize.height, dpr);
  const guidelineOffsets = getGuidelineOffsets(canvasSize.height);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Resizing the canvas attributes reset the context, so setTransform
        // (idempotent, unlike scale) reapplies the dpr scaling each time.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        setContext(ctx);
      }
    }
  }, [canvasSize.width, canvasSize.height, dpr]);

  const getCoordinates = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      // Strokes are drawn in CSS-pixel coordinates (the context is dpr-scaled),
      // so divide the backing-store size back down by dpr before mapping.
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / dpr / rect.width;
      const scaleY = canvas.height / dpr / rect.height;
      let clientX, clientY;

      if ('touches' in event) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
      } else {
        clientX = (event as React.MouseEvent).clientX;
        clientY = (event as React.MouseEvent).clientY;
      }

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    [dpr]
  );

  const startDrawing = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      if (disabled || !context) return;
      event.preventDefault();

      const { x, y } = getCoordinates(event);
      context.beginPath();
      context.moveTo(x, y);
      setIsDrawing(true);
    },
    [disabled, context, getCoordinates]
  );

  const draw = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || !context) return;
      event.preventDefault();

      const { x, y } = getCoordinates(event);
      context.lineTo(x, y);
      context.stroke();
    },
    [isDrawing, context, getCoordinates]
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing || !context) return;

    context.closePath();
    setIsDrawing(false);
    setHasSignature(true);
    if (hideConfirm) {
      // No internal confirm button — hand the signature to the parent after
      // every stroke so its own confirm action can take over.
      const canvas = canvasRef.current;
      if (canvas) onSave(canvas.toDataURL('image/png'));
    }
  }, [isDrawing, context, hideConfirm, onSave]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
      onClear?.();
    }
  }, [onClear]);

  const save = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      const signatureData = canvas.toDataURL('image/png');
      onSave(signatureData);
    }
  }, [hasSignature, onSave]);

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className={`relative ${fullWidth ? 'w-full' : ''}`}>
        <canvas
          data-testid="signature-canvas"
          ref={canvasRef}
          width={metrics.pixelWidth}
          height={metrics.pixelHeight}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={`border-2 border-gray-300 rounded-lg bg-white touch-none ${
            fullWidth ? 'w-full' : ''
          } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-crosshair'}`}
          style={
            fullWidth
              ? { height: canvasSize.height }
              : { width: canvasSize.width, maxWidth: '100%', height: 'auto' }
          }
        />

        <div
          className="absolute left-4 right-4 border-b-2 border-gray-400 pointer-events-none"
          style={{ bottom: guidelineOffsets.baseline }}
        />
        <div
          className="absolute left-4 text-sm text-gray-400 pointer-events-none"
          style={{ bottom: guidelineOffsets.label }}
        >
          Sign here
        </div>
      </div>

      <p className="text-sm text-gray-500 text-center">
        Use your mouse or touch screen to sign above
      </p>

      <div className="flex justify-center gap-4">
        <button
          onClick={clear}
          disabled={disabled || !hasSignature}
          type="button"
          className="px-4 py-3 min-h-[44px] text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 touch-manipulation"
        >
          Clear
        </button>
        {!hideConfirm && (
          <button
            onClick={save}
            disabled={disabled || !hasSignature}
            type="button"
            className="px-4 py-3 min-h-[44px] text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 touch-manipulation"
          >
            Confirm Signature
          </button>
        )}
      </div>
    </div>
  );
};

export default SignaturePad;
