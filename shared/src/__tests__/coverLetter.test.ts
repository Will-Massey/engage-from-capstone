import {
  formatCoverLetter,
  dedupeLeadingGreetings,
  startsWithSalutation,
  stripLeadingGreetings,
} from '../coverLetter';

describe('formatCoverLetter', () => {
  it('keeps the letter\'s own salutation style — "Hi Jon" stays, duplicate "Dear Jon" dropped', () => {
    const r = formatCoverLetter({
      body: 'Hi Jon,\n\nDear Jon,\n\nThanks for meeting us last week.',
      contactName: 'Jon Smith',
      companyName: 'Smith Joinery Ltd',
    });
    expect(r.companyLine).toBe('Smith Joinery Ltd');
    expect(r.greeting).toBe('Hi Jon,');
    expect(r.paragraphs).toEqual(['Thanks for meeting us last week.']);
  });

  it('strips a salutation opening the summary so it cannot re-greet mid-letter', () => {
    const r = formatCoverLetter({
      body: 'Hi Jon,\n\nHere is our proposal.',
      summary: 'Dear Jon,\n\nA summary of the services.',
      contactName: 'Jon',
      companyName: 'Acme Ltd',
    });
    expect(r.greeting).toBe('Hi Jon,');
    expect(r.paragraphs).toEqual(['Here is our proposal.', 'A summary of the services.']);
  });

  it('collapses a duplicated greeting to one and puts the company above it', () => {
    const body =
      'Dear Michelle Beesley,\n\nDear Michelle Beesley,\n\nI am Caroline Marks of Fortis Accountancy. I am writing to share our proposal.';
    const r = formatCoverLetter({
      body,
      contactName: 'Michelle Beesley',
      companyName: 'V12 Hospitality Ltd',
    });
    expect(r.companyLine).toBe('V12 Hospitality Ltd');
    expect(r.greeting).toBe('Dear Michelle Beesley,');
    expect(r.paragraphs).toEqual([
      'I am Caroline Marks of Fortis Accountancy. I am writing to share our proposal.',
    ]);
  });

  it('strips a single existing greeting and re-emits it once', () => {
    const r = formatCoverLetter({
      body: 'Dear Jane,\n\nThank you for the opportunity.',
      contactName: 'Jane',
      companyName: 'Acme Ltd',
    });
    expect(r.greeting).toBe('Dear Jane,');
    expect(r.companyLine).toBe('Acme Ltd');
    expect(r.paragraphs).toEqual(['Thank you for the opportunity.']);
  });

  it('adds a greeting when the body has none', () => {
    const r = formatCoverLetter({
      body: 'Thank you for the opportunity to work with you.',
      contactName: 'Jane Doe',
      companyName: 'Acme Ltd',
    });
    expect(r.greeting).toBe('Dear Jane Doe,');
    expect(r.paragraphs).toEqual(['Thank you for the opportunity to work with you.']);
  });

  it('omits the company line when there is no distinct contact person', () => {
    const r = formatCoverLetter({ body: 'Dear Acme Ltd,\n\nBody.', companyName: 'Acme Ltd' });
    expect(r.companyLine).toBeNull();
    expect(r.greeting).toBe('Dear Acme Ltd,');
    expect(r.paragraphs).toEqual(['Body.']);
  });

  it('strips an inline "Dear X," prefix sharing the first paragraph', () => {
    const r = formatCoverLetter({
      body: 'Dear Jane, I am writing to introduce our services.',
      contactName: 'Jane',
      companyName: 'Acme Ltd',
    });
    expect(r.greeting).toBe('Dear Jane,');
    expect(r.paragraphs).toEqual(['I am writing to introduce our services.']);
  });

  it('handles a bare "{name}," modern-tone opener', () => {
    const r = formatCoverLetter({
      body: 'Michelle Beesley,\n\nHere is what we recommend.',
      contactName: 'Michelle Beesley',
      companyName: 'V12 Hospitality Ltd',
    });
    expect(r.paragraphs).toEqual(['Here is what we recommend.']);
    expect(r.greeting).toBe('Dear Michelle Beesley,');
  });

  it('does not strip a real paragraph that merely starts with Dear', () => {
    const long =
      'Dear to us is the principle of proactive advice, and that is exactly what our team delivers every single month without fail across your accounts.';
    const r = formatCoverLetter({ body: long, contactName: 'Jane', companyName: 'Acme' });
    expect(r.paragraphs[0]).toBe(long);
  });

  it('keeps a trailing sign-off (only leading greetings are stripped)', () => {
    const r = formatCoverLetter({
      body: 'Dear Jane,\n\nOpening paragraph.\n\nYours sincerely,\n\nCaroline Marks',
      contactName: 'Jane',
      companyName: 'Acme',
    });
    expect(r.paragraphs).toEqual(['Opening paragraph.', 'Yours sincerely,', 'Caroline Marks']);
  });
});

describe('dedupeLeadingGreetings', () => {
  it('collapses a double greeting to the first one', () => {
    expect(dedupeLeadingGreetings('Hi Jon,\n\nDear Jon,\n\nBody paragraph.')).toBe(
      'Hi Jon,\n\nBody paragraph.'
    );
  });

  it('drops an inline duplicate salutation after a standalone greeting', () => {
    expect(dedupeLeadingGreetings('Hi Jon,\n\nDear Jon, thanks for your time.')).toBe(
      'Hi Jon,\n\nthanks for your time.'
    );
  });

  it('leaves a single-greeting letter untouched', () => {
    const text = 'Hi Jon,\n\nThanks for your time.';
    expect(dedupeLeadingGreetings(text)).toBe(text);
  });

  it('leaves a letter with no greeting untouched', () => {
    const text = 'Thank you for the opportunity.\n\nWe would be pleased to act.';
    expect(dedupeLeadingGreetings(text)).toBe(text);
  });
});

describe('startsWithSalutation', () => {
  it('detects a standalone greeting', () => {
    expect(startsWithSalutation('Hi Jon,\n\nThanks.')).toBe(true);
  });

  it('detects an inline greeting', () => {
    expect(startsWithSalutation('Dear Jane, thank you for your time.')).toBe(true);
  });

  it('is false for a plain opening sentence', () => {
    expect(startsWithSalutation('Thank you for the opportunity to work with you.')).toBe(false);
  });
});

describe('stripLeadingGreetings', () => {
  it('removes every leading salutation', () => {
    expect(stripLeadingGreetings('Hi Jon,\n\nDear Jon,\n\nBody paragraph.')).toBe(
      'Body paragraph.'
    );
  });

  it('removes an inline salutation prefix', () => {
    expect(stripLeadingGreetings('Dear Jane, thank you for your time.')).toBe(
      'thank you for your time.'
    );
  });
});
