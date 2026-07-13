import { generateAcceptanceNotification } from '../acceptanceNotification.js';
import { renderTouchpointTemplate, renderTouchpointSubject } from '../touchpoint.js';

describe('acceptanceNotification HTML escaping', () => {
  const base = {
    clientName: 'Acme Ltd',
    proposalTitle: 'Annual Accounts',
    proposalReference: 'PRO-001',
    acceptedAt: new Date('2026-01-01T10:00:00Z'),
    totalAmount: '£1,200',
    signedBy: 'Jane Doe',
    signedByRole: 'Director',
  };

  it('escapes markup injected via the public signer fields', () => {
    const { html } = generateAcceptanceNotification({
      ...base,
      signedBy: '<script>alert(1)</script>',
      signedByRole: '"><img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes client name and amount', () => {
    const { html } = generateAcceptanceNotification({
      ...base,
      clientName: 'A & B <Ltd>',
      totalAmount: '<b>£1</b>',
    });
    expect(html).toContain('A &amp; B &lt;Ltd&gt;');
    expect(html).toContain('&lt;b&gt;£1&lt;/b&gt;');
  });
});

describe('touchpoint merge-tag escaping', () => {
  const context = {
    client_name: '<script>alert(1)</script>',
    practice_name: 'Capstone & Co',
  };

  it('escapes merge values rendered into the HTML body', () => {
    const out = renderTouchpointTemplate(
      '<p>Hello {{client_name}} from {{practice_name}}</p>',
      context
    );
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('Capstone &amp; Co');
    expect(out).not.toContain('<script>alert(1)</script>');
  });

  it('does not escape the plain-text subject', () => {
    const out = renderTouchpointSubject('Update for {{practice_name}}', context);
    expect(out).toBe('Update for Capstone & Co');
  });
});
