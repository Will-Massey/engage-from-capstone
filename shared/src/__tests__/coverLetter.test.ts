import { formatCoverLetter } from '../coverLetter';

describe('formatCoverLetter', () => {
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
