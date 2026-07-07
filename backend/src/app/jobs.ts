import logger from '../utils/logger.js';
import { withJobLock, JOB_LOCKS } from '../utils/jobLock.js';

// Schedule renewal reminder job (daily at 9 AM)
import { runRenewalReminders } from '../jobs/renewalReminders.js';
import { runProposalChaseJob } from '../jobs/proposalChaseJob.js';

// Client touchpoint / lifecycle automation engine
import { runTouchpointEngine } from '../jobs/touchpointEngine.js';
import { runEmailAutomation } from '../jobs/emailAutomation.js';

// Run immediately on startup in production, or every 24 hours
const RENEWAL_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export function scheduleRenewalReminders() {
  logger.info('📅 Scheduling renewal reminder job...');

  const tick = () =>
    withJobLock(JOB_LOCKS.renewalReminders, 'renewal reminders', runRenewalReminders).catch((err) =>
      logger.error('Renewal reminder check failed:', err)
    );

  // Run once at startup (with delay to let server fully start), then every 24h
  setTimeout(tick, 60000);
  setInterval(tick, RENEWAL_CHECK_INTERVAL);

  logger.info('✅ Renewal reminder job scheduled (every 24 hours)');
}

export function scheduleProposalChaseJob() {
  logger.info('📅 Scheduling proposal chase job...');

  const tick = () =>
    withJobLock(JOB_LOCKS.proposalChase, 'proposal chase', runProposalChaseJob).catch((err) =>
      logger.error('Proposal chase check failed:', err)
    );

  setTimeout(tick, 120_000);
  setInterval(tick, RENEWAL_CHECK_INTERVAL);

  logger.info('✅ Proposal chase job scheduled (every 24 hours)');
}

export function scheduleTouchpointEngine() {
  logger.info('📅 Scheduling client touchpoint engine...');

  const INTERVAL = 15 * 60 * 1000; // every 15 minutes

  const tick = () =>
    withJobLock(JOB_LOCKS.touchpointEngine, 'touchpoint engine', runTouchpointEngine).catch((err) =>
      logger.error('Touchpoint engine run failed:', err)
    );

  setTimeout(tick, 90_000);
  setInterval(tick, INTERVAL);

  logger.info('✅ Touchpoint engine scheduled (every 15 minutes)');
}

export function scheduleEmailAutomation() {
  logger.info(
    '📅 Scheduling proposal email automation (unopened 3d, unsigned 7d, expiring 30d)...'
  );

  const INTERVAL = 24 * 60 * 60 * 1000; // daily

  const tick = () =>
    withJobLock(JOB_LOCKS.emailAutomation, 'email automation', runEmailAutomation).catch((err) =>
      logger.error('Email automation run failed:', err)
    );

  setTimeout(tick, 120_000);
  setInterval(tick, INTERVAL);

  logger.info('✅ Email automation scheduled (every 24 hours)');
}
