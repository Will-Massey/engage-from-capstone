/**
 * Scheduled quarterly LOE library release — runs on the first day of each quarter.
 */
import logger from '../config/logger.js';
import {
  isQuarterlyReviewDay,
  publishQuarterlyLibraryRelease,
} from '../services/engagementLibraryVersionService.js';

export async function runQuarterlyLibraryRelease(asOf = new Date()): Promise<void> {
  if (!isQuarterlyReviewDay(asOf)) {
    logger.debug('Quarterly library release skipped — not a review day', {
      date: asOf.toISOString().slice(0, 10),
    });
    return;
  }

  logger.info('Running scheduled quarterly engagement library release…');

  const result = await publishQuarterlyLibraryRelease({ asOf });

  if (result.skipped === true) {
    logger.info(`Quarterly library release skipped: ${result.reason}`);
    return;
  }

  logger.info('Quarterly engagement library published', {
    versionLabel: result.versionLabel,
    proposalTemplatesFlagged: result.proposalTemplatesFlagged,
    coverLetterTemplatesFlagged: result.coverLetterTemplatesFlagged,
    changedClauses: result.changedClauseIds?.length ?? 0,
  });
}
