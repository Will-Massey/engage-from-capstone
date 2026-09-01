import { parseClientImportCsv, SAMPLE_CLIENT_CSV } from '../clientImportCsv';

describe('parseClientImportCsv', () => {
  it('reads the Engager sample and alias headers', () => {
    expect(parseClientImportCsv(SAMPLE_CLIENT_CSV)).toEqual([
      {
        name: 'Acme Trading Ltd',
        contactEmail: 'accounts@acme.example',
        contactName: 'Jane Smith',
        contactPhone: '07700900000',
        companyNumber: '12345678',
        companyType: 'LIMITED_COMPANY',
        notes: 'Migrated from Engager',
      },
      {
        name: 'Sole Trader Joe',
        contactEmail: 'joe@example.com',
        contactName: 'Joe Bloggs',
        contactPhone: '',
        companyNumber: '',
        companyType: 'SOLE_TRADER',
        notes: '',
      },
    ]);
    expect(parseClientImportCsv('Client,Email\n"Fortis, Ltd",hello@fortis.example')).toEqual([
      {
        name: 'Fortis, Ltd',
        contactEmail: 'hello@fortis.example',
        contactName: undefined,
        contactPhone: undefined,
        companyNumber: undefined,
        companyType: undefined,
        notes: undefined,
      },
    ]);
  });

  it('rejects a file without name and email', () => {
    expect(() => parseClientImportCsv('foo,bar\n1,2')).toThrow(/name and contactEmail/);
  });
});
