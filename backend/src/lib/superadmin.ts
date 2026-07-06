/**
 * Capstone Superadmin client + connector for Engage.
 * Self-contained — no imports from capstone-superadmin repo.
 *
 * Env: SUPERADMIN_URL, SUPERADMIN_WEBHOOK_SECRET, SUPERADMIN_API_KEY
 */
import { createHash, createHmac } from 'node:crypto';
import logger from '../utils/logger.js';

const APP_ID = 'engage';

/** Commands the Engage connector will execute — reject anything else. */
const ALLOWED_SUPERADMIN_COMMANDS = new Set([
  'ping',
  'health_check',
  'sync_tenants',
  'suspend_tenant',
  'unsuspend_tenant',
  'broadcast_message',
  'set_feature_flag',
]);

// --- HMAC signing (from capstone-superadmin/shared/verify-signature.js) ---

function buildCanonicalString(
  method: string,
  path: string,
  timestamp: string,
  body: string | object = ''
): string {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const bodyHash = createHash('sha256').update(bodyStr).digest('hex');
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;
}

function signRequest(
  apiSecret: string,
  method: string,
  path: string,
  timestamp: string,
  body: string | object = ''
): string {
  const canonical = buildCanonicalString(method, path, timestamp, body);
  return createHmac('sha256', apiSecret).update(canonical).digest('hex');
}

// --- CapstoneSuperadminClient (from capstone-superadmin/shared/capstone-client.js) ---

type ClientOptions = {
  baseUrl: string;
  appId: string;
  webhookSecret: string;
  apiKey?: string;
};

type PendingCommand = {
  id: string;
  command: string;
  payload?: unknown;
};

export class CapstoneSuperadminClient {
  private baseUrl: string;
  private appId: string;
  private webhookSecret: string;
  private apiKey?: string;

  constructor({ baseUrl, appId, webhookSecret, apiKey }: ClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.appId = appId;
    this.webhookSecret = webhookSecret;
    this.apiKey = apiKey;
  }

  private async _request<T = unknown>(method: string, path: string, body?: object): Promise<T> {
    const timestamp = String(Date.now());
    const bodyStr = body ? JSON.stringify(body) : '';
    const signature = signRequest(this.webhookSecret, method, path, timestamp, bodyStr);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Capstone-App-Id': this.appId,
      'X-Capstone-Timestamp': timestamp,
      'X-Capstone-Signature': signature,
    };

    if (this.apiKey) {
      headers['X-Capstone-Api-Key'] = this.apiKey;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: bodyStr || undefined,
    });

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data as T;
  }

  pushMetrics(metrics: object[]) {
    return this._request('POST', '/api/v1/ingest/metrics', { metrics });
  }

  pushEvents(events: object[]) {
    return this._request('POST', '/api/v1/ingest/events', { events });
  }

  syncTenants(tenants: object[]) {
    return this._request('POST', '/api/v1/ingest/tenants', { tenants });
  }

  pollCommands() {
    return this._request<{ commands?: PendingCommand[] }>('GET', '/api/v1/commands/pending');
  }

  ackCommand(id: string, status = 'ACKNOWLEDGED', error?: string) {
    return this._request('POST', `/api/v1/commands/${id}/ack`, {
      status,
      ...(error && { error }),
    });
  }
}

// --- Connector (from capstone-superadmin/integrations/connector.js) ---

type ConnectorOptions = {
  appId?: string;
  baseUrl?: string;
  webhookSecret?: string;
  apiKey?: string;
};

type DailyMetrics = {
  activeUsers?: number;
  trials?: number;
  mrr?: number;
  signups?: number;
};

type Connector = {
  client: CapstoneSuperadminClient;
  reportSignup: (opts: {
    tenantId?: string;
    name?: string;
    email?: string;
    plan?: string;
  }) => Promise<void>;
  reportTrialStarted: (opts: {
    tenantId: string;
    name?: string;
    trialEndsAt?: string;
  }) => Promise<void>;
  reportConversion: (opts: { tenantId: string; plan: string; mrr: number }) => Promise<void>;
  reportPaymentSucceeded: (opts: {
    tenantId: string;
    plan: string;
    amount: number;
    currency: string;
    interval: 'month' | 'year';
    paymentType: string;
    orderId?: string;
  }) => Promise<void>;
  reportDailyMetrics: (stats: DailyMetrics) => Promise<void>;
  syncAllTenants: (tenants: object[]) => Promise<unknown>;
  startCommandPoller: (
    handler: (cmd: PendingCommand) => Promise<void>,
    intervalMs?: number
  ) => Promise<NodeJS.Timeout>;
};

export function createConnector({
  appId,
  baseUrl,
  webhookSecret,
  apiKey,
}: ConnectorOptions = {}): Connector {
  const client = new CapstoneSuperadminClient({
    baseUrl: baseUrl || process.env.SUPERADMIN_URL || '',
    appId: appId || process.env.SUPERADMIN_APP_ID || APP_ID,
    webhookSecret: webhookSecret || process.env.SUPERADMIN_WEBHOOK_SECRET || '',
    apiKey: apiKey || process.env.SUPERADMIN_API_KEY,
  });

  return {
    client,

    async reportSignup({ tenantId, name, email, plan = 'trial' }) {
      await client.pushEvents([{ eventType: 'signup', payload: { tenantId, name, email, plan } }]);
      if (tenantId) {
        await client.syncTenants([
          {
            externalTenantId: tenantId,
            name: name || email,
            plan,
            planStatus: plan === 'trial' ? 'trial' : 'active',
          },
        ]);
      }
    },

    async reportTrialStarted({ tenantId, name, trialEndsAt }) {
      await client.pushEvents([{ eventType: 'trial_started', payload: { tenantId } }]);
      await client.syncTenants([
        {
          externalTenantId: tenantId,
          name,
          plan: 'trial',
          planStatus: 'trial',
          trialEndsAt,
        },
      ]);
    },

    async reportConversion({ tenantId, plan, mrr }) {
      await client.pushEvents([{ eventType: 'trial_converted', payload: { tenantId, plan, mrr } }]);
      await client.syncTenants([{ externalTenantId: tenantId, plan, planStatus: 'active', mrr }]);
      await client.pushMetrics([{ metric: 'mrr', value: mrr, dimensions: { tenantId } }]);
    },

    async reportPaymentSucceeded({
      tenantId,
      plan,
      amount,
      currency,
      interval,
      paymentType,
      orderId,
    }) {
      await client.pushEvents([
        {
          eventType: 'payment_succeeded',
          payload: { tenantId, plan, amount, currency, interval, paymentType, orderId },
        },
      ]);
    },

    async reportDailyMetrics({ activeUsers, trials, mrr, signups }) {
      const metrics: object[] = [];
      if (activeUsers != null) {
        metrics.push({ metric: 'active_users', value: activeUsers });
      }
      if (trials != null) {
        metrics.push({ metric: 'trials_active', value: trials });
      }
      if (mrr != null) {
        metrics.push({ metric: 'mrr', value: mrr });
      }
      if (signups != null) {
        metrics.push({ metric: 'signups', value: signups });
      }
      if (metrics.length) await client.pushMetrics(metrics);
    },

    async syncAllTenants(tenants) {
      return client.syncTenants(tenants);
    },

    async startCommandPoller(handler, intervalMs = 60000) {
      const poll = async () => {
        try {
          const { commands } = await client.pollCommands();
          for (const cmd of commands || []) {
            try {
              await handler(cmd);
              await client.ackCommand(cmd.id);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              await client.ackCommand(cmd.id, 'FAILED', message);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error('[superadmin] command poll failed:', message);
        }
      };
      await poll();
      return setInterval(poll, intervalMs);
    },
  };
}

// --- Engage integration (from capstone-superadmin/integrations/apps/engage.js) ---

let connectorInstance: Connector | null = null;

export function initEngageSuperadmin(): Connector | null {
  if (!process.env.SUPERADMIN_URL) {
    return null;
  }

  if (!process.env.SUPERADMIN_WEBHOOK_SECRET) {
    logger.warn(
      '[engage] SUPERADMIN_URL set but SUPERADMIN_WEBHOOK_SECRET missing — skipping superadmin'
    );
    return null;
  }

  const connector = createConnector({ appId: APP_ID });
  connectorInstance = connector;

  connector
    .startCommandPoller(async (cmd) => {
      if (!ALLOWED_SUPERADMIN_COMMANDS.has(cmd.command)) {
        logger.warn('[engage] rejected superadmin command', { command: cmd.command });
        throw new Error(`Command not allowed: ${cmd.command}`);
      }
      if (process.env.NODE_ENV === 'production') {
        logger.info('[engage] superadmin command accepted', { command: cmd.command, id: cmd.id });
      } else {
        logger.info('[engage] superadmin command', { command: cmd.command, id: cmd.id });
      }
      // Wire to tenant suspension, broadcasts, feature flags, etc.
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[engage] superadmin command poller failed to start:', message);
    });

  logger.info('[engage] Capstone Superadmin connected:', process.env.SUPERADMIN_URL);
  return connector;
}

export function getEngageSuperadmin(): Connector | null {
  return connectorInstance;
}

export async function engageReportProposalSent({
  tenantId,
  proposalId,
  value,
}: {
  tenantId: string;
  proposalId: string;
  value: number;
}) {
  const c = createConnector({ appId: APP_ID });
  await c.client.pushEvents([
    { eventType: 'proposal.sent', payload: { tenantId, proposalId, value } },
  ]);
  await c.client.pushMetrics([{ metric: 'proposal_value', value, dimensions: { tenantId } }]);
}
