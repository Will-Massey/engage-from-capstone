/** Strip markdown heading markers from plain-text proposal terms. */
export function stripMarkdownHeadings(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        const title = m[2].trim();
        return title.toUpperCase() === title ? title : title;
      }
      return line.replace(/\*\*/g, '');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}