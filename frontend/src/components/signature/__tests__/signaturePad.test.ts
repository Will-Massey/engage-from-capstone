import { describe, expect, it } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SignaturePad from '../SignaturePad';
import {
  MAX_CANVAS_SCALE,
  MIN_CANVAS_HEIGHT,
  MIN_CANVAS_WIDTH,
  clampDevicePixelRatio,
  computeFullWidthCanvasSize,
  getCanvasMetrics,
  getGuidelineOffsets,
} from '../signaturePadGeometry';

describe('signature pad geometry', () => {
  describe('clampDevicePixelRatio', () => {
    it('defaults to 1 when devicePixelRatio is missing or invalid', () => {
      expect(clampDevicePixelRatio(undefined)).toBe(1);
      expect(clampDevicePixelRatio(0)).toBe(1);
      expect(clampDevicePixelRatio(Number.NaN)).toBe(1);
      expect(clampDevicePixelRatio(Number.POSITIVE_INFINITY)).toBe(1);
    });

    it('passes through ratios within the supported range', () => {
      expect(clampDevicePixelRatio(1)).toBe(1);
      expect(clampDevicePixelRatio(1.5)).toBe(1.5);
      expect(clampDevicePixelRatio(2)).toBe(2);
    });

    it('caps high ratios at the maximum scale', () => {
      expect(clampDevicePixelRatio(3)).toBe(MAX_CANVAS_SCALE);
      expect(clampDevicePixelRatio(4)).toBe(MAX_CANVAS_SCALE);
    });

    it('never scales below 1', () => {
      expect(clampDevicePixelRatio(0.5)).toBe(1);
    });
  });

  describe('getCanvasMetrics', () => {
    it('scales the backing store by dpr while keeping CSS size unchanged', () => {
      const metrics = getCanvasMetrics(600, 200, 2);
      expect(metrics).toEqual({
        cssWidth: 600,
        cssHeight: 200,
        pixelWidth: 1200,
        pixelHeight: 400,
        scale: 2,
      });
    });

    it('is a no-op at dpr 1 (and when dpr is unavailable)', () => {
      expect(getCanvasMetrics(600, 200, undefined).pixelWidth).toBe(600);
      expect(getCanvasMetrics(600, 200, 1).pixelHeight).toBe(200);
    });

    it('rounds fractional backing-store sizes to whole pixels', () => {
      const metrics = getCanvasMetrics(351, 181, 1.5);
      expect(metrics.pixelWidth).toBe(527); // 351 * 1.5 = 526.5
      expect(metrics.pixelHeight).toBe(272); // 181 * 1.5 = 271.5
      expect(Number.isInteger(metrics.pixelWidth)).toBe(true);
      expect(Number.isInteger(metrics.pixelHeight)).toBe(true);
    });

    it('caps the scale so huge dprs do not blow up canvas memory', () => {
      const metrics = getCanvasMetrics(600, 200, 3);
      expect(metrics.scale).toBe(MAX_CANVAS_SCALE);
      expect(metrics.pixelWidth).toBe(1200);
    });
  });

  describe('computeFullWidthCanvasSize', () => {
    it('tracks the container width with a 0.35 aspect height', () => {
      expect(computeFullWidthCanvasSize(1000)).toEqual({ width: 1000, height: 350 });
    });

    it('enforces the mobile minimums', () => {
      expect(computeFullWidthCanvasSize(200)).toEqual({
        width: MIN_CANVAS_WIDTH,
        height: MIN_CANVAS_HEIGHT,
      });
      // 390px phone: width tracks container, height floors at 180
      expect(computeFullWidthCanvasSize(390)).toEqual({ width: 390, height: 180 });
    });
  });

  describe('getGuidelineOffsets', () => {
    it('positions the baseline and label proportionally to canvas height', () => {
      expect(getGuidelineOffsets(180)).toEqual({ baseline: 32, label: 7 });
      expect(getGuidelineOffsets(220)).toEqual({ baseline: 40, label: 9 });
      expect(getGuidelineOffsets(400)).toEqual({ baseline: 72, label: 16 });
    });

    it('keeps the label below the baseline at all heights', () => {
      for (const height of [180, 220, 300, 500]) {
        const { baseline, label } = getGuidelineOffsets(height);
        expect(label).toBeLessThan(baseline);
        expect(baseline).toBeLessThan(height / 2);
      }
    });
  });
});

describe('SignaturePad confirm button', () => {
  // renderToStaticMarkup runs the render without effects — enough to assert
  // which controls the component offers without a real canvas.
  const render = (props: Partial<ComponentProps<typeof SignaturePad>> = {}) =>
    renderToStaticMarkup(createElement(SignaturePad, { onSave: () => {}, ...props }));

  it('renders the internal Confirm Signature button by default', () => {
    const markup = render();
    expect(markup).toContain('Confirm Signature');
    expect(markup).toContain('Clear');
  });

  it('hides the internal confirm button when hideConfirm is set', () => {
    const markup = render({ hideConfirm: true });
    expect(markup).not.toContain('Confirm Signature');
    // The Clear button stays available
    expect(markup).toContain('Clear');
  });
});
