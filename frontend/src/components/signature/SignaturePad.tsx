import { useRef, useState, useEffect, useCallback } from 'react';

interface SignaturePadProps {
  onSave: (signatureData: string) => void;
  onClear?: () => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

const SignaturePad = ({
  onSave,
  onClear,
  width = 600,
  height = 200,
  disabled = false,
}: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);

  // Initialize canvas context
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
  }, []);

  const getCoordinates = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      let clientX, clientY;

      if ('touches' in event) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
      } else {
        clientX = (event as React.MouseEvent).clientX;
        clientY = (event as React.MouseEvent).clientY;
      }

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    []
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
      // Convert to base64 PNG
      const signatureData = canvas.toDataURL('image/png');
      onSave(signatureData);
    }
  }, [hasSignature, onSave]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && context) {
        // Save current content
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.drawImage(canvas, 0, 0);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [context]);

  return (
    <div className="space-y-4">
      {/* Canvas Container */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={`border-2 border-gray-300 rounded-lg bg-white touch-none ${
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-crosshair'
          }`}
          style={{ maxWidth: '100%', height: 'auto' }}
        />

        {/* Signature Line */}
        <div className="absolute bottom-8 left-8 right-8 border-b-2 border-gray-400 pointer-events-none" />
        <div className="absolute bottom-2 left-8 text-sm text-gray-400 pointer-events-none">
          Sign here
        </div>
      </div>

      {/* Instructions */}
      <p className="text-sm text-gray-500 text-center">
        Use your mouse or touch screen to sign above
      </p>

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4">
        <button
          onClick={clear}
          disabled={disabled || !hasSignature}
          type="button"
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
        >
          Clear
        </button>
        <button
          onClick={save}
          disabled={disabled || !hasSignature}
          type="button"
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          Confirm Signature
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
