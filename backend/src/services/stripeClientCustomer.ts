/**
 * Stripe customers for proposal payments are per client entity.
 * A shared contact email must not reuse another company's Stripe customer.
 * The oldest entity with an email keeps Checkout's customer_email behaviour
 * so an existing quote is unchanged until it has its own stored customer id.
 */

import { prisma } from '../config/database.js';
import { stripe } from '../config/stripe.js';
import logger from '../config/logger.js';
import { chooseStripeCustomerStrategy, type StripePeer } from './clientIdentity.js';

export interface StripeCheckoutCustomer {
  customerId?: string;
  customerEmail?: string;
}

export async function resolveStripeCustomerForCheckout(input: {
  clientId: string;
  tenantId: string;
  contactEmail: string;
  clientName: string;
  companyNumber?: string | null;
}): Promise<StripeCheckoutCustomer> {
  const peers: StripePeer[] = await prisma.client.findMany({
    where: {
      tenantId: input.tenantId,
      contactEmail: { equals: input.contactEmail, mode: 'insensitive' },
    },
    select: { id: true, createdAt: true, stripeCustomerId: true },
    orderBy: { createdAt: 'asc' },
  });

  const strategy = chooseStripeCustomerStrategy({
    clientId: input.clientId,
    contactEmail: input.contactEmail,
    peers,
  });

  if (strategy.mode === 'legacy_email') {
    return { customerEmail: strategy.customerEmail };
  }
  if (strategy.mode === 'stored') {
    return { customerId: strategy.customerId };
  }

  const customerId = await ensureDedicatedStripeCustomer(input);
  return { customerId };
}

async function ensureDedicatedStripeCustomer(input: {
  clientId: string;
  tenantId: string;
  contactEmail: string;
  clientName: string;
  companyNumber?: string | null;
}): Promise<string> {
  if (!stripe) throw new Error('STRIPE_NOT_CONFIGURED');

  const query = `metadata['engageClientId']:'${input.clientId.replace(/'/g, '')}'`;
  try {
    const found = await stripe.customers.search({ query, limit: 1 });
    const existing = found.data?.[0]?.id;
    if (existing) {
      await prisma.client.update({
        where: { id: input.clientId },
        data: { stripeCustomerId: existing },
      });
      return existing;
    }
  } catch (err) {
    logger.warn(`Stripe customer search by engageClientId failed for ${input.clientId}`, err);
  }

  const created = await stripe.customers.create({
    email: input.contactEmail,
    name: input.clientName,
    metadata: {
      engageClientId: input.clientId,
      tenantId: input.tenantId,
      companyNumber: input.companyNumber?.trim() || '',
    },
  });

  await prisma.client.update({
    where: { id: input.clientId },
    data: { stripeCustomerId: created.id },
  });

  return created.id;
}

export function stripeCheckoutCustomerFields(input: StripeCheckoutCustomer): {
  customer?: string;
  customer_email?: string;
} {
  if (input.customerId) return { customer: input.customerId };
  return { customer_email: input.customerEmail };
}
