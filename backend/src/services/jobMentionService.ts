/**
 * @mention email pings for job notes. Best-effort per recipient — one bad
 * address must never block the note or the other mentions.
 */
import logger from '../config/logger.js';
import { getFrontendUrl } from '../config/urls.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { tenantMailerSend } from './tenantMailer.js';

export interface MentionedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export async function sendMentionEmails(opts: {
  tenantId: string;
  job: { id: string; title: string; reference: string };
  actorName: string;
  message: string;
  mentions: MentionedUser[];
  /** Self-mentions are skipped */
  actorUserId?: string | null;
}): Promise<{ sent: number; failed: number }> {
  const jobUrl = `${getFrontendUrl()}/jobs/${opts.job.id}`;
  const safeActor = escapeHtml(opts.actorName);
  const safeRef = escapeHtml(opts.job.reference);
  const safeTitle = escapeHtml(opts.job.title);
  const safeNote = escapeHtml(opts.message.slice(0, 500));

  let sent = 0;
  let failed = 0;
  for (const m of opts.mentions) {
    if (m.id === opts.actorUserId) continue;
    try {
      const result = await tenantMailerSend({
        tenantId: opts.tenantId,
        messageType: 'OTHER',
        message: {
          to: m.email,
          subject: `${opts.actorName} mentioned you on ${opts.job.reference}`,
          html: `<p>${safeActor} mentioned you on <strong>${safeRef} — ${safeTitle}</strong>:</p><blockquote style="border-left:3px solid #0ea5e9;margin:8px 0;padding:4px 12px;color:#334155;">${safeNote}</blockquote><p><a href="${jobUrl}">Open the job</a></p>`,
        },
      });
      if (result.success) sent++;
      else failed++;
    } catch (e) {
      failed++;
      logger.warn(`Mention email failed for ${m.email} on job ${opts.job.id}`, e);
    }
  }
  return { sent, failed };
}
