export type ClientImportRow = {
  name: string;
  contactEmail: string;
  contactName?: string;
  contactPhone?: string;
  companyNumber?: string;
  companyType?: string;
  notes?: string;
};

export const SAMPLE_CLIENT_CSV = `name,contactEmail,contactName,contactPhone,companyNumber,companyType,notes
Acme Trading Ltd,accounts@acme.example,Jane Smith,07700900000,12345678,LIMITED_COMPANY,Migrated from Engager
Sole Trader Joe,joe@example.com,Joe Bloggs,,,SOLE_TRADER,
`;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseClientImportCsv(text: string): ClientImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ''));
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iName = idx(['name', 'client', 'clientname', 'company']);
  const iEmail = idx(['contactemail', 'email', 'clientemail']);
  const iContact = idx(['contactname', 'contact', 'primarycontact']);
  const iPhone = idx(['contactphone', 'phone', 'mobile', 'tel']);
  const iCo = idx(['companynumber', 'companyno', 'crn', 'registrationnumber']);
  const iType = idx(['companytype', 'type', 'entitytype']);
  const iNotes = idx(['notes', 'note', 'comments']);

  if (iName < 0 || iEmail < 0) {
    throw new Error('CSV must include name and contactEmail (or email) columns');
  }

  const rows: ClientImportRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const name = cells[iName] || '';
    const contactEmail = cells[iEmail] || '';
    if (!name || !contactEmail) continue;
    rows.push({
      name,
      contactEmail,
      contactName: iContact >= 0 ? cells[iContact] : undefined,
      contactPhone: iPhone >= 0 ? cells[iPhone] : undefined,
      companyNumber: iCo >= 0 ? cells[iCo] : undefined,
      companyType: iType >= 0 ? cells[iType] : undefined,
      notes: iNotes >= 0 ? cells[iNotes] : undefined,
    });
  }
  return rows;
}
