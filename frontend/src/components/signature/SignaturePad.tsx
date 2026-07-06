import { useRef, useState, useEffect, useCallback } from 'react';

interface SignaturePadProps {
  onSave: (signatureData: string) => void;
  onClear?: () => void;
  width?: number;
  height?: number;
  disabled?: boolean;
  fullWidth?: boolean;
}

const SignaturePad = ({
  onSave,
  onClear,
  width = 600,
  height = 200,
  disabled = false,
  fullWidth = false,
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
      setCanvasSize({
        width: Math.max(containerWidth, 280),
        height: Math.max(Math.round(containerWidth * 0.35), 180),
      });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [fullWidth, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        setContext(ctx);
      }
    }
  }, [canvasSize.width, canvasSize.height]);

  const getCoordinates = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
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
  }, []);

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
  }, [isDrawing, context]);

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
          width={canvasSize.width}
          height={canvasSize.height}
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
          style={fullWidth ? { height: canvasSize.height } : { maxWidth: '100%', height: 'auto' }}
        />

        <div className="absolute bottom-8 left-4 right-4 border-b-2 border-gray-400 pointer-events-none" />
        <div className="absolute bottom-2 left-4 text-sm text-gray-400 pointer-events-none">
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
        <button
          onClick={save}
          disabled={disabled || !hasSignature}
          type="button"
          className="px-4 py-3 min-h-[44px] text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 touch-manipulation"
        >
          Confirm Signature
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
