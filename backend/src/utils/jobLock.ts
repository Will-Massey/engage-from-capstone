import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

/**
 * Stable advisory-lock keys, one per scheduled job. Postgres advisory locks are
 * a cluster-wide mutex, so only one backend instance runs a given job tick even
 * when several instances are deployed — preventing duplicate client emails.
 */
export const JOB_LOCKS = {
  renewalReminders: 4101,
  proposalChase: 4102,
  touchpointEngine: 4103,
  emailAutomation: 4104,
  disputeReconciliation: 4105,
} as const;

/**
 * Run `job` only if this instance can acquire the advisory lock for `lockKey`;
 * otherwise skip (another instance is running it). The transaction-scoped lock
 * (pg_try_advisory_xact_lock) is held for the job's duration and auto-released
 * when the wrapping transaction ends — no connection-affinity bookkeeping and
 * no lock leak on crash. The job's own queries use the normal pool; the lock is
 * purely a mutex.
 */
export async function withJobLock(
  lockKey: number,
  label: string,
  job: () => Promise<unknown>,
  timeoutMs = 10 * 60 * 1000
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${lockKey}) AS locked
      `;
      if (!rows[0]?.locked) {
        logger.info(`⏭️  Job "${label}" skipped — lock held by another instance`);
        return;
      }
      await job();
    },
    { timeout: timeoutMs, maxWait: 5_000 }
  );
}
