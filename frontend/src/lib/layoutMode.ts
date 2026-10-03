export type LayoutMode = 'compact' | 'regular';

/**
 * Compact is the phone chrome (bottom tabs, drawer). Regular is the adaptive
 * chrome (persistent sidebar) used on iPad and on large Android screens.
 *
 * Landscape phones stay compact: they are wide, but too short for a sidebar.
 * Desktop widths are always regular, including a short window.
 *
 * Keep these thresholds in step with the shell media queries in `index.css`.
 */
export function layoutMode(width: number, height: number): LayoutMode {
  if (width >= 1024) return 'regular';
  if (width >= 768 && height >= 600) return 'regular';
  return 'compact';
}
