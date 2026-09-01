jest.mock('../ai/aiClient.js', () => ({
  isAiConfigured: () => isAiConfigured(),
  chatCompletion: (...args: unknown[]) => chatCompletion(...args),
}));

const isAiConfigured = jest.fn();
const chatCompletion = jest.fn();

import { extractTasksFromNotes, looksLikeProse, splitNoteLines } from '../meetingNotesService.js';

beforeEach(() => {
  jest.clearAllMocks();
  isAiConfigured.mockReturnValue(false);
});

describe('splitNoteLines', () => {
  it('strips bullets and numbered lists', () => {
    expect(splitNoteLines('- Bank pack\n* VAT folder\n1. Call Ada\n• Chase payroll')).toEqual([
      'Bank pack',
      'VAT folder',
      'Call Ada',
      'Chase payroll',
    ]);
  });
});

describe('looksLikeProse', () => {
  it('treats a long single paragraph as prose', () => {
    const notes =
      'We met Ada this morning and agreed to request the bank pack, chase the VAT folder, and book a follow-up once payroll is in.';
    expect(looksLikeProse(notes, splitNoteLines(notes))).toBe(true);
  });

  it('treats a bullet list as structured notes', () => {
    const notes = '- Bank pack\n- VAT folder\n- Follow-up call';
    expect(looksLikeProse(notes, splitNoteLines(notes))).toBe(false);
  });
});

describe('extractTasksFromNotes', () => {
  it('uses line split for bullets without calling Clara', async () => {
    const { titles, source } = await extractTasksFromNotes('- Bank pack\n- VAT folder');
    expect(source).toBe('lines');
    expect(titles).toEqual(['Bank pack', 'VAT folder']);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('uses Clara for prose when the model returns tasks', async () => {
    isAiConfigured.mockReturnValue(true);
    chatCompletion.mockResolvedValue({
      content: JSON.stringify({ tasks: ['Request bank pack', 'Chase VAT folder'] }),
    });
    const notes =
      'We met Ada this morning and agreed to request the bank pack and chase the VAT folder next week.';
    const { titles, source } = await extractTasksFromNotes(notes);
    expect(source).toBe('clara');
    expect(titles).toEqual(['Request bank pack', 'Chase VAT folder']);
  });

  it('falls back to sentences when AI is off', async () => {
    const notes =
      'Request the bank pack from Ada. Chase the VAT folder. Book a follow-up once payroll lands.';
    const { titles, source } = await extractTasksFromNotes(notes);
    expect(source).toBe('sentences');
    expect(titles[0]).toMatch(/bank pack/i);
  });
});
