import {
  buildAutoReplyMessages,
  THREAD_MESSAGE_LIMIT,
  THREAD_BODY_CHAR_LIMIT,
  type AutoReplyContext,
} from '../prompt.js';

const ctx = (over: Partial<AutoReplyContext> = {}): AutoReplyContext => ({
  practiceName: 'Fortis Bookkeeping',
  clientName: 'Acme Ltd',
  clientContactName: 'Ada',
  openJobs: ['VAT return Q2'],
  openProposals: [],
  outstandingRequests: ['Bank statements'],
  thread: [
    {
      direction: 'inbound',
      from: 'ada@acme.co.uk',
      at: '2026-08-09T09:00:00Z',
      body: 'Do I need to register for VAT yet?',
    },
  ],
  ...over,
});

describe('buildAutoReplyMessages', () => {
  it('carries the number-shy constraints in the system prompt', () => {
    const system = buildAutoReplyMessages(ctx())[0].content.toLowerCase();
    expect(system).toContain('never');
    expect(system).toMatch(/figure|amount|calculat/);
    expect(system).toContain('holding reply');
  });

  it('forbids estimates and ranges however hedged, not just the enumerated examples', () => {
    const system = buildAutoReplyMessages(ctx())[0].content.toLowerCase();
    expect(system).toContain('however hedged or qualified');
    expect(system).toMatch(/\brange\b/);
    expect(system).toMatch(/\bestimate\b/);
    expect(system).toMatch(/\bapproximation\b/);
  });

  it('forbids repeating or quoting a client-specific figure already present in context', () => {
    const system = buildAutoReplyMessages(ctx())[0].content.toLowerCase();
    expect(system).toContain('this includes repeating or quoting a figure');
    expect(system).toMatch(/thread, the client record, or the open-work lists/);
  });

  it('still permits general, non-client-specific published facts', () => {
    const system = buildAutoReplyMessages(ctx())[0].content.toLowerCase();
    expect(system).toContain(
      'general published facts that are not specific to this client remain fine'
    );
    expect(system).toMatch(/vat registration threshold/);
  });

  it('names the accounting domains it should be capable in', () => {
    const system = buildAutoReplyMessages(ctx())[0].content.toLowerCase();
    for (const topic of ['vat', 'mtd', 'cis', 'self assessment', 'payroll']) {
      expect(system).toContain(topic);
    }
  });

  it('includes practice, client and open work in the user message', () => {
    const user = buildAutoReplyMessages(ctx())[1].content;
    expect(user).toContain('Fortis Bookkeeping');
    expect(user).toContain('Acme Ltd');
    expect(user).toContain('VAT return Q2');
    expect(user).toContain('Bank statements');
    expect(user).toContain('Do I need to register for VAT yet?');
  });

  it('caps the thread at the most recent N messages', () => {
    const many = Array.from({ length: THREAD_MESSAGE_LIMIT + 5 }, (_, i) => ({
      direction: 'inbound' as const,
      from: 'ada@acme.co.uk',
      at: '2026-08-09T09:00:00Z',
      body: `message-${i}`,
    }));
    const user = buildAutoReplyMessages(ctx({ thread: many }))[1].content;
    expect(user).not.toContain('message-0');
    expect(user).toContain(`message-${THREAD_MESSAGE_LIMIT + 4}`);
  });

  it('trims an oversized body', () => {
    const user = buildAutoReplyMessages(
      ctx({
        thread: [
          {
            direction: 'inbound',
            from: 'ada@acme.co.uk',
            at: '2026-08-09T09:00:00Z',
            body: 'x'.repeat(THREAD_BODY_CHAR_LIMIT + 500),
          },
        ],
      })
    )[1].content;
    expect(user).not.toContain('x'.repeat(THREAD_BODY_CHAR_LIMIT + 1));
  });

  it('handles an unknown client without crashing', () => {
    const msgs = buildAutoReplyMessages(ctx({ clientName: null, clientContactName: null }));
    expect(msgs).toHaveLength(2);
  });

  it("puts today's date into the user message", () => {
    const user = buildAutoReplyMessages(ctx(), new Date('2026-08-09T12:00:00Z'))[1].content;
    expect(user).toContain('2026-08-09');
  });

  it('defaults the date to now when no date is passed', () => {
    const user = buildAutoReplyMessages(ctx())[1].content;
    expect(user).toMatch(/TODAY'S DATE: \d{4}-\d{2}-\d{2}/);
  });

  it('instructs the model not to state a stale threshold, rate or deadline figure from memory', () => {
    const system = buildAutoReplyMessages(ctx())[0].content.toLowerCase();
    expect(system).toContain(
      'do not state a specific threshold, rate, or statutory deadline figure'
    );
    expect(system).toContain('the accountant will confirm the current figure');
  });
});
