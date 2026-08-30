/**
 * W3.5 — turn meeting notes into job task titles.
 * Bullet lists stay deterministic. Prose goes through Clara when AI is on.
 */
import { chatCompletion, isAiConfigured } from './ai/aiClient.js';

const MAX_TASKS = 40;
const MIN_LEN = 2;
const MAX_LEN = 300;

export function splitNoteLines(notes: string): string[] {
  return notes
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*[-*•–—]\s+/, '')
        .replace(/^\s*\d+[.)]\s+/, '')
        .replace(/^\s*\[ ?[xX ] ?\]\s+/, '')
        .trim()
    )
    .filter((line) => line.length >= MIN_LEN && line.length <= MAX_LEN)
    .slice(0, MAX_TASKS);
}

export function looksLikeProse(notes: string, lines: string[]): boolean {
  const compact = notes.replace(/\s+/g, ' ').trim();
  return lines.length <= 2 && compact.length > 80;
}

function splitSentences(notes: string): string[] {
  return notes
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_LEN && s.length <= MAX_LEN)
    .slice(0, MAX_TASKS);
}

async function claraExtractTasks(notes: string): Promise<string[] | null> {
  if (!isAiConfigured()) return null;
  try {
    const result = await chatCompletion(
      [
        {
          role: 'system',
          content:
            'You are Clara, a UK accountancy practice co-pilot. Extract concrete staff tasks from meeting notes. Return JSON only: {"tasks":["..."]}. Short titles, UK English, no fees or invented deadlines. Max 40 items.',
        },
        { role: 'user', content: notes.slice(0, 8_000) },
      ],
      { jsonMode: true, temperature: 0.2, maxTokens: 800 }
    );
    const parsed = JSON.parse(result.content) as { tasks?: unknown };
    if (!Array.isArray(parsed.tasks)) return null;
    const titles = parsed.tasks
      .map((t) => String(t || '').trim())
      .filter((t) => t.length >= MIN_LEN && t.length <= MAX_LEN)
      .slice(0, MAX_TASKS);
    return titles.length ? titles : null;
  } catch {
    return null;
  }
}

export async function extractTasksFromNotes(
  notes: string
): Promise<{ titles: string[]; source: 'lines' | 'clara' | 'sentences' }> {
  const lines = splitNoteLines(notes);
  if (!looksLikeProse(notes, lines) && lines.length) {
    return { titles: lines, source: 'lines' };
  }

  const fromClara = await claraExtractTasks(notes);
  if (fromClara?.length) {
    return { titles: fromClara, source: 'clara' };
  }

  const sentences = splitSentences(notes);
  if (sentences.length) {
    return { titles: sentences, source: 'sentences' };
  }

  return { titles: lines, source: 'lines' };
}
