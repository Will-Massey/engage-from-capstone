/**
 * Pure geometry helpers for SignaturePad — extracted so the HiDPI scaling
 * maths and responsive sizing can be unit tested without a real canvas.
 */

/** Minimum CSS width of the pad in fullWidth mode. */
export const MIN_CANVAS_WIDTH = 280;
/** Minimum CSS height of the pad in fullWidth mode (mobile floor). */
export const MIN_CANVAS_HEIGHT = 180;
/** Cap the backing-store scale — >2 adds memory cost with no visible gain. */
export const MAX_CANVAS_SCALE = 2;

/** Clamp window.devicePixelRatio into the supported [1, 2] range. */
export function clampDevicePixelRatio(devicePixelRatio: number | undefined): number {
  if (!devicePixelRatio || !Number.isFinite(devicePixelRatio)) return 1;
  return Math.min(Math.max(devicePixelRatio, 1), MAX_CANVAS_SCALE);
}

export interface CanvasMetrics {
  /** CSS-pixel size the canvas occupies on screen. */
  cssWidth: number;
  cssHeight: number;
  /** Backing-store (device-pixel) size — cssSize × scale. */
  pixelWidth: number;
  pixelHeight: number;
  /** The clamped scale applied via ctx.setTransform so strokes stay in CSS coords. */
  scale: number;
}

/** Backing-store dimensions for a CSS-sized canvas at the given devicePixelRatio. */
export function getCanvasMetrics(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number | undefined
): CanvasMetrics {
  const scale = clampDevicePixelRatio(devicePixelRatio);
  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.round(cssWidth * scale),
    pixelHeight: Math.round(cssHeight * scale),
    scale,
  };
}

/** CSS size of the pad when it tracks its container width (fullWidth mode). */
export function computeFullWidthCanvasSize(containerWidth: number): {
  width: number;
  height: number;
} {
  const width = Math.max(containerWidth, MIN_CANVAS_WIDTH);
  return {
    width,
    height: Math.max(Math.round(width * 0.35), MIN_CANVAS_HEIGHT),
  };
}

/**
 * Bottom offsets (CSS px) for the "Sign here" baseline and label, proportional
 * to the canvas height so they sit sensibly from the 180px mobile floor up to
 * tall desktop canvases.
 */
export function getGuidelineOffsets(cssHeight: number): { baseline: number; label: number } {
  return {
    baseline: Math.round(cssHeight * 0.18),
    label: Math.round(cssHeight * 0.04),
  };
}
