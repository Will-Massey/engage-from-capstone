/**
 * Import QuickBooks customers → Engage clients (R4.1).
 * Mirrors the Xero import route: entity dedupe (legal name or qbo id), dryRun
 * preview, and a `qbo:<Id>` tag linking the client back to the QBO customer.
 * A shared email does not block a second company.
 */

import { CompanyType } from '@prisma/client';
import { prisma } from '../config/database.js';
import { findSameEntity, type ExistingClientIdentity } from './clientIdentity.js';
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
    select: { id: true, name: true, contactEmail: true, companyNumber: true, tags: true },
  });

  const known: ExistingClientIdentity[] = existing.map((client) => ({
    id: client.id,
    name: client.name,
    contactEmail: client.contactEmail,
    companyNumber: client.companyNumber,
    tags: client.tags,
  }));

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

    const same = findSameEntity(known, {
      name,
      externalTag: qboCustomerId ? `qbo:${qboCustomerId}` : null,
    });
    if (same) {
      skipped.push({
        name: name || email,
        reason: same.reason,
        existingClientId: same.client.id,
      });
      continue;
    }

    if (dryRun) {
      created.push({
        name: name || email,
        contactEmail: email || `${qboCustomerId}@import.local`,
      });
      known.push({
        id: `dry-${qboCustomerId || name}`,
        name: name || email,
        contactEmail: email,
        tags: qboCustomerId ? `qbo:${qboCustomerId}` : '',
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

      known.push({
        id: client.id,
        name: client.name,
        contactEmail: client.contactEmail,
        tags: client.tags,
      });
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
