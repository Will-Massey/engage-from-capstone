import { getChasePack, listChasePacks, renderChaseTemplate } from '../chasePackService.js';

describe('chasePackService', () => {
  it('lists UK chase packs', () => {
    const packs = listChasePacks();
    expect(packs.length).toBeGreaterThanOrEqual(5);
    expect(packs.some((p) => p.id === 'RECORDS_REQUEST')).toBe(true);
  });

  it('renders optional due date blocks', () => {
    const pack = getChasePack('RECORDS_REQUEST')!;
    const withDue = renderChaseTemplate(pack.bodyHtml, {
      contact_name: 'Alex',
      client_name: 'Acme Ltd',
      job_title: 'Annual accounts',
      due_date: '30/09/2026',
      practice_name: 'Demo LLP',
      portal_link: 'https://example.test/portal',
    });
    expect(withDue).toContain('30/09/2026');
    expect(withDue).toContain('Acme Ltd');
    expect(withDue).toContain('https://example.test/portal');

    const noDue = renderChaseTemplate(pack.bodyHtml, {
      contact_name: 'Alex',
      client_name: 'Acme Ltd',
      job_title: 'Annual accounts',
      practice_name: 'Demo LLP',
    });
    expect(noDue).not.toContain('ideally by');
  });
});
