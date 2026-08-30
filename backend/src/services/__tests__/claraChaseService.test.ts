jest.mock('../ai/aiClient.js', () => ({
  isAiConfigured: () => isAiConfigured(),
  chatCompletion: (...args: unknown[]) => chatCompletion(...args),
}));

jest.mock('../voiceOfPracticeService.js', () => ({
  getVoiceOfPracticePromptContext: (...args: unknown[]) => getVoiceOfPracticePromptContext(...args),
}));

const isAiConfigured = jest.fn();
const chatCompletion = jest.fn();
const getVoiceOfPracticePromptContext = jest.fn();

import {
  draftJobChase,
  draftProposalChase,
  parseChaseDraftMetadata,
} from '../claraChaseService.js';

const JOB_CTX = {
  tenantId: 't1',
  practiceName: 'Fortis',
  job: {
    title: 'Year-end accounts',
    reference: 'JOB-1',
    boardColumn: 'REQUEST_RECORDS',
    dueAt: new Date('2026-09-15T00:00:00.000Z'),
    client: { name: 'Acme Ltd', contactName: 'Ada', contactEmail: 'ada@acme.test' },
  },
  openPhases: ['Records'],
  openChecks: ['Bank statements'],
};

beforeEach(() => {
  jest.clearAllMocks();
  isAiConfigured.mockReturnValue(false);
  getVoiceOfPracticePromptContext.mockResolvedValue('');
});

describe('draftJobChase', () => {
  it('falls back to the records pack when AI is off', async () => {
    const draft = await draftJobChase(JOB_CTX);
    expect(draft.source).toBe('template');
    expect(draft.subject).toMatch(/Year-end accounts/);
    expect(draft.bodyHtml).toMatch(/Ada/);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it('uses Clara when the model returns subject and body', async () => {
    isAiConfigured.mockReturnValue(true);
    chatCompletion.mockResolvedValue({
      content: JSON.stringify({
        subject: 'Records still needed',
        bodyHtml: '<p>Please send the bank pack.</p>',
      }),
    });
    const draft = await draftJobChase({
      ...JOB_CTX,
      previous: { subject: 'Old', bodyHtml: '<p>Old</p>' },
    });
    expect(draft.source).toBe('clara');
    expect(draft.subject).toBe('Records still needed');
    expect(chatCompletion).toHaveBeenCalled();
    const user = (chatCompletion.mock.calls[0][0] as Array<{ content: string }>)[1].content;
    expect(user).toMatch(/Rewrite this chase/);
  });
});

describe('draftProposalChase', () => {
  it('falls back to a deadline pack when AI is off', async () => {
    const draft = await draftProposalChase({
      tenantId: 't1',
      practiceName: 'Fortis',
      proposal: {
        title: '2026 engagement',
        reference: 'PROP-1',
        client: { name: 'Acme Ltd', contactName: 'Ada' },
      },
    });
    expect(draft.source).toBe('template');
    expect(draft.subject).toMatch(/2026 engagement|Acme Ltd/);
    expect(draft.bodyHtml).toMatch(/Ada/);
  });
});

describe('parseChaseDraftMetadata', () => {
  it('reads a stored draft and ignores empty notes', () => {
    expect(
      parseChaseDraftMetadata(
        JSON.stringify({ subject: 'Hi', bodyHtml: '<p>Body</p>', source: 'clara' })
      )
    ).toEqual({ subject: 'Hi', bodyHtml: '<p>Body</p>', source: 'clara' });
    expect(parseChaseDraftMetadata('{"action":"notify.assignee"}')).toBeNull();
  });
});
