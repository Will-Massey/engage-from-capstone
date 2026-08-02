import { generateLetterHtml, letterTitle } from '../practiceLetterService.js';

describe('practiceLetterService', () => {
  const ctx = {
    practiceName: 'Smith & Associates',
    clientName: 'TechStart Ltd',
    contactName: 'James Wilson',
    companyNumber: '12345678',
    effectiveDate: '01/08/2026',
  };

  it('builds disengagement letter', () => {
    const html = generateLetterHtml('DISENGAGEMENT', ctx);
    expect(html).toContain('cease to act');
    expect(html).toContain('TechStart Ltd');
    expect(letterTitle('DISENGAGEMENT', ctx.clientName)).toMatch(/disengagement/i);
  });

  it('builds professional clearance letter', () => {
    const html = generateLetterHtml('PROFESSIONAL_CLEARANCE', {
      ...ctx,
      successorFirm: 'NewCo Accountants',
    });
    expect(html).toContain('Professional clearance');
    expect(html).toContain('NewCo Accountants');
  });

  it('builds 64-8 pack without claiming live HMRC submit', () => {
    const html = generateLetterHtml('HMRC_64_8', { ...ctx, utr: '1234567890' });
    expect(html).toContain('64-8');
    expect(html).toContain('does not itself submit to HMRC');
  });
});
