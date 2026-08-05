/**
 * Mention email pings: self-mention skip, per-recipient isolation, HTML
 * escaping of interpolated note text, deep link.
 */
const tenantMailerSendMock = jest.fn();
jest.mock('../tenantMailer.js', () => ({
  tenantMailerSend: (...args: unknown[]) => tenantMailerSendMock(...args),
}));

jest.mock('../../config/urls.js', () => ({
  getFrontendUrl: () => 'https://capstonesoftware.co.uk/engage',
}));

import { sendMentionEmails } from '../jobMentionService.js';

const job = { id: 'job1', title: 'CT600 2026', reference: 'JOB-001' };
const alice = { id: 'u-alice', firstName: 'Alice', lastName: 'A', email: 'alice@practice.test' };
const bob = { id: 'u-bob', firstName: 'Bob', lastName: 'B', email: 'bob@practice.test' };

beforeEach(() => {
  tenantMailerSendMock.mockReset();
  tenantMailerSendMock.mockResolvedValue({ success: true, messageId: 'm1' });
});

describe('sendMentionEmails', () => {
  it('emails each mentioned colleague except the actor, with subject and deep link', async () => {
    const result = await sendMentionEmails({
      tenantId: 't1',
      job,
      actorName: 'Alice A',
      message: 'Please review @Bob',
      mentions: [alice, bob],
      actorUserId: 'u-alice',
    });

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(tenantMailerSendMock).toHaveBeenCalledTimes(1);
    const call = tenantMailerSendMock.mock.calls[0][0];
    expect(call.tenantId).toBe('t1');
    expect(call.message.to).toBe('bob@practice.test');
    expect(call.message.subject).toBe('Alice A mentioned you on JOB-001');
    expect(call.message.html).toContain('https://capstonesoftware.co.uk/engage/jobs/job1');
    expect(call.message.html).toContain('Please review @Bob');
  });

  it('escapes HTML in the note, actor, and job fields', async () => {
    await sendMentionEmails({
      tenantId: 't1',
      job: { ...job, title: 'CT600 <script>alert(1)</script>' },
      actorName: 'Alice <img src=x>',
      message: 'Watch out <b>&</b> stay safe',
      mentions: [bob],
      actorUserId: 'u-alice',
    });

    const html = tenantMailerSendMock.mock.calls[0][0].message.html as string;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('one failing recipient never blocks the others', async () => {
    tenantMailerSendMock
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce({ success: true, messageId: 'm2' });

    const carol = {
      id: 'u-carol',
      firstName: 'Carol',
      lastName: 'C',
      email: 'carol@practice.test',
    };
    const result = await sendMentionEmails({
      tenantId: 't1',
      job,
      actorName: 'Alice A',
      message: 'FYI @Bob @Carol',
      mentions: [bob, carol],
      actorUserId: 'u-alice',
    });

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(tenantMailerSendMock).toHaveBeenCalledTimes(2);
  });

  it('truncates the quoted note at 500 characters', async () => {
    await sendMentionEmails({
      tenantId: 't1',
      job,
      actorName: 'Alice A',
      message: 'x'.repeat(600),
      mentions: [bob],
      actorUserId: 'u-alice',
    });
    const html = tenantMailerSendMock.mock.calls[0][0].message.html as string;
    expect(html).toContain('x'.repeat(500));
    expect(html).not.toContain('x'.repeat(501));
  });
});
