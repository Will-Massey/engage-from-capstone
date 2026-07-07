/**
 * Escape user-supplied strings before interpolating them into HTML
 * (notification emails, etc.) to prevent HTML/script injection.
 */
export function escapeHtml(value: string): string {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return value.replace(/[&<>"']/g, (m) => map[m as keyof typeof map]);
}
