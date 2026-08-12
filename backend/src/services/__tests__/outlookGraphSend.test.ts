/**
 * A practice's connected Microsoft mailbox must be able to send.
 *
 * The connect flow consents to Graph scopes (Mail.Read, Mail.Send,
 * Mail.ReadWrite, offline_access), but the send path asked Microsoft to
 * exchange that refresh token for `https://outlook.office365.com/SMTP.Send` —
 * a different resource nobody ever consented to — and then spoke SMTP to
 * smtp.office365.com, which most M365 tenants disable by default. Two
 * independent reasons the same send could never work.
 *
 * Sending through Graph uses the grant we already hold.
 */
jest.mock('../../config/database.js', () => ({ prisma: {} }));

import { EmailService, type EmailConfig } from '../emailService.js';

const outlookConfig: EmailConfig = {
  provider: 'microsoft365',
  fromName: 'Fortis Accountancy',
  fromEmail: 'caroline@fortisaccounts.com',
  outlook: {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    refreshToken: 'refresh-token',
    user: 'caroline@fortisaccounts.com',
  },
};

const tokenResponse = () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => ({ access_token: 'graph-token', expires_in: 3600 }),
});

describe('Microsoft mailbox send', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const sendOne = async (extra: Partial<Parameters<EmailService['sendEmail']>[0]> = {}) => {
    const svc = await EmailService.createReady(outlookConfig);
    return svc.sendEmail({
      to: 'client@example.com',
      subject: 'Your proposal',
      html: '<p>Your proposal is ready.</p>',
      ...extra,
    });
  };

  it('asks for a token Microsoft actually granted us, not the SMTP scope', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockResolvedValueOnce({ ok: true, status: 202, statusText: 'Accepted' });

    await sendOne();

    const tokenBody = String(fetchMock.mock.calls[0][1].body);
    expect(tokenBody).toContain('graph.microsoft.com%2FMail.Send');
    expect(tokenBody).not.toContain('outlook.office365.com');
  });

  it('sends the message through Graph rather than SMTP', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockResolvedValueOnce({ ok: true, status: 202, statusText: 'Accepted' });

    const result = await sendOne();

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(init.headers.Authorization).toBe('Bearer graph-token');
    const body = JSON.parse(init.body);
    expect(body.message.subject).toBe('Your proposal');
    expect(body.message.body).toEqual({
      contentType: 'HTML',
      content: '<p>Your proposal is ready.</p>',
    });
    expect(body.message.toRecipients).toEqual([
      { emailAddress: { address: 'client@example.com' } },
    ]);
    expect(result.success).toBe(true);
  });

  it('carries attachments, so the proposal PDF still reaches the client', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockResolvedValueOnce({ ok: true, status: 202, statusText: 'Accepted' });

    await sendOne({
      attachments: [
        {
          filename: 'proposal.pdf',
          content: Buffer.from('%PDF-1.7'),
          contentType: 'application/pdf',
        },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.message.attachments).toEqual([
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: 'proposal.pdf',
        contentType: 'application/pdf',
        contentBytes: Buffer.from('%PDF-1.7').toString('base64'),
      },
    ]);
  });

  it('reports a Graph rejection as a failed send rather than throwing', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'ErrorAccessDenied',
    });

    const result = await sendOne();

    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });
});
