import { z } from 'zod';
import { stripe } from '../../config/stripe.js';

function requireStripe() {
  if (!stripe) throw new Error('STRIPE_NOT_CONFIGURED');
  return stripe;
}

// The SDK types don't cover the v2 namespace yet (calls go through `as any`),
// so validate live payloads at the boundary instead of trusting them.
// Field-level validation: with strictNullChecks off, z.object inference
// marks every property optional, so object schemas can't type the returns.
const transfersStatusSchema = z.object({
  configuration: z
    .object({
      recipient: z
        .object({
          capabilities: z
            .object({
              stripe_balance: z
                .object({
                  stripe_transfers: z.object({ status: z.string() }).nullish(),
                })
                .nullish(),
            })
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  payload: unknown,
  what: string
): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Accounts v2 ${what} returned an unexpected payload: ${result.error.message}`);
  }
  return result.data;
}

function requireString(value: unknown, what: string): string {
  const result = z.string().min(1).safeParse(value);
  if (!result.success) {
    throw new Error(`Accounts v2 ${what} returned an unexpected payload`);
  }
  return result.data;
}

export async function createRecipientAccount(params: {
  country: string;
  email?: string;
  businessName?: string;
}): Promise<{ id: string }> {
  const s = requireStripe();
  // Accounts v2 — recipient config only (no merchant/card_payments).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = await (s as any).v2.core.accounts.create({
    dashboard: 'express',
    defaults: {
      responsibilities: {
        fees_collector: 'application',
        losses_collector: 'application',
      },
    },
    identity: { country: params.country },
    contact_email: params.email,
    display_name: params.businessName,
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    include: ['configuration.recipient', 'requirements'],
  });
  return { id: requireString(account?.id, 'accounts.create id') };
}

export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<{ url: string }> {
  const s = requireStripe();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await (s as any).v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['recipient'],
        return_url: returnUrl,
        refresh_url: refreshUrl,
      },
    },
  });
  return { url: requireString(link?.url, 'accountLinks.create url') };
}

export async function getTransfersStatus(accountId: string): Promise<string> {
  const s = requireStripe();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = await (s as any).v2.core.accounts.retrieve(accountId, {
    include: ['configuration.recipient'],
  });
  const parsed = parseOrThrow(transfersStatusSchema, account, 'accounts.retrieve');
  return (
    parsed.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ??
    'inactive'
  );
}
