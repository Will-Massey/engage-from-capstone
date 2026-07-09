import { stripe } from '../../config/stripe.js';

function requireStripe() {
  if (!stripe) throw new Error('STRIPE_NOT_CONFIGURED');
  return stripe;
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
  return { id: account.id as string };
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
  return { url: link.url as string };
}

export async function getTransfersStatus(accountId: string): Promise<string> {
  const s = requireStripe();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = await (s as any).v2.core.accounts.retrieve(accountId, {
    include: ['configuration.recipient'],
  });
  return (
    account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ??
    'inactive'
  );
}
