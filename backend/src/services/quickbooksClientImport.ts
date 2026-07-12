/**
 * Import QuickBooks customers → Engage clients (R4.1).
 * Mirrors the Xero import route: email/name dedupe, dryRun preview, and a
 * `qbo:<Id>` tag linking the client back to the QBO customer.
 */

import { CompanyType } from '@prisma/client';
import { prisma } from '../config/database.js';
import { normalizeClientName } from './xeroService.js';
import { getAuthenticatedQuickBooksSession } from './quickbooksService.js';
import { queryCustomers } from './quickbooksApi.js';
import {
  getTenantQuickBooksSettings,
  saveTenantQuickBooksSettings,
} from './tenantQuickbooksSettings.js';

export interface QuickBooksClientImportResult {
  dryRun: boolean;
  qboCustomersFetched: number;
  created: number;
  skipped: number;
  errors: number;
  createdClients: Array<{ name: string; contactEmail: string; qboCustomerId?: string }>;
  skippedCustomers: Array<{ name: string; reason: string; existingClientId?: string }>;
  importErrors: Array<{ name: string; error: string }>;
}

export async function importQuickBooksClients(
  tenantId: string,
  dryRun: boolean
): Promise<QuickBooksClientImportResult> {
  const session = await getAuthenticatedQuickBooksSession(tenantId);
  const customers = await queryCustomers(session);

  const existing = await prisma.client.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, contactEmail: true, tags: true },
  });

  const byEmail = new Map<string, (typeof existing)[0]>();
  const byName = new Map<string, (typeof existing)[0]>();

  for (const c of existing) {
    if (c.contactEmail) {
      byEmail.set(c.contactEmail.toLowerCase().trim(), c);
    }
    byName.set(normalizeClientName(c.name), c);
  }

  const created: QuickBooksClientImportResult['createdClients'] = [];
  const skipped: QuickBooksClientImportResult['skippedCustomers'] = [];
  const errors: QuickBooksClientImportResult['importErrors'] = [];

  for (const customer of customers) {
    const name = (customer.DisplayName || '').trim();
    const email = (customer.PrimaryEmailAddr?.Address || '').trim().toLowerCase();
    const qboCustomerId = customer.Id;

    if (customer.Active === false) {
      skipped.push({ name: name || '(inactive)', reason: 'inactive_customer' });
      continue;
    }

    if (!name && !email) {
      skipped.push({ name: '(blank)', reason: 'missing_name_and_email' });
      continue;
    }

    if (email && byEmail.has(email)) {
      skipped.push({
        name: name || email,
        reason: 'duplicate_email',
        existingClientId: byEmail.get(email)!.id,
      });
      continue;
    }

    if (name && byName.has(normalizeClientName(name))) {
      skipped.push({
        name,
        reason: 'duplicate_name',
        existingClientId: byName.get(normalizeClientName(name))!.id,
      });
      continue;
    }

    if (dryRun) {
      created.push({
        name: name || email,
        contactEmail: email || `${qboCustomerId}@import.local`,
      });
      continue;
    }

    try {
      const client = await prisma.client.create({
        data: {
          tenantId,
          name: name || email,
          contactEmail: email || `qbo-${qboCustomerId}@engage-import.local`,
          contactName: name,
          companyType: CompanyType.LIMITED_COMPANY,
          notes: `Imported from QuickBooks (customer ${qboCustomerId})`,
          tags: qboCustomerId ? `qbo:${qboCustomerId}` : 'qbo-import',
          vatRegistered: false,
        },
      });

      created.push({
        name: client.name,
        contactEmail: client.contactEmail,
        qboCustomerId,
      });

      if (email) byEmail.set(email, client);
      byName.set(normalizeClientName(client.name), client);
    } catch (err: unknown) {
      errors.push({
        name: name || email,
        error: err instanceof Error ? err.message : 'create_failed',
      });
    }
  }

  if (!dryRun) {
    const settings = await getTenantQuickBooksSettings(tenantId);
    if (settings) {
      await saveTenantQuickBooksSettings(tenantId, {
        ...settings,
        lastImportAt: new Date().toISOString(),
      });
    }
  }

  return {
    dryRun,
    qboCustomersFetched: customers.length,
    created: created.length,
    skipped: skipped.length,
    errors: errors.length,
    createdClients: created,
    skippedCustomers: skipped.slice(0, 100),
    importErrors: errors,
  };
}
