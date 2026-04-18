/**
 * Run renewal + valid-until reminder job once (for cron, ops, or local verification).
 * Requires DATABASE_URL and email env if emails should send.
 *
 *   cd backend && npx tsx scripts/run-renewal-reminders.ts
 */
import 'dotenv/config';
import { runRenewalReminders } from '../src/jobs/renewalReminders.js';

runRenewalReminders()
  .then((stats) => {
    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
