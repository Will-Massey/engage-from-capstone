/**
 * Touchpoint template rendering
 * Merge tags supported:
 *   {{client_name}}
 *   {{contact_name}}
 *   {{practice_name}}
 *   {{next_step}}
 *   {{due_date}}
 *   {{aml_portal_link}}
 *   {{portal_link}}
 *
 * This is deliberately separate from the sending / scheduling logic so non-technical
 * users can edit wording in the admin UI (TouchpointTemplate table) without code changes.
 */

import { escapeHtml } from '../utils/escapeHtml.js';

export interface TouchpointMergeContext {
  client_name: string;
  contact_name?: string;
  practice_name: string;
  next_step?: string;
  due_date?: string; // pre-formatted
  [key: string]: string | undefined;
}

function applyMergeTags(
  template: string,
  context: TouchpointMergeContext,
  escape: boolean
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = context[key];
    if (value === undefined) return '';
    return escape ? escapeHtml(String(value)) : String(value);
  });
}

/**
 * Render the touchpoint body. The body is admin-authored HTML, but the merge
 * values (client/contact/practice names, free-text extras) are user/tenant data,
 * so they are HTML-escaped to prevent injection into the outgoing email.
 */
export function renderTouchpointTemplate(body: string, context: TouchpointMergeContext): string {
  return applyMergeTags(body, context, true);
}

/** Render the plain-text subject line — no HTML context, so values are not escaped. */
export function renderTouchpointSubject(subject: string, context: TouchpointMergeContext): string {
  return applyMergeTags(subject, context, false);
}

/**
 * Helper to build a safe context from a client + tenant + optional extras.
 */
export function buildMergeContext(params: {
  client: { name: string; contactName?: string | null };
  tenant: { name: string };
  nextStep?: string;
  dueDate?: Date | string | null;
  extra?: Record<string, string | undefined>;
}): TouchpointMergeContext {
  const { client, tenant, nextStep, dueDate, extra = {} } = params;

  let dueDateStr: string | undefined;
  if (dueDate) {
    const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
    dueDateStr = d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  return {
    client_name: client.name,
    contact_name: client.contactName || client.name,
    practice_name: tenant.name,
    next_step: nextStep || '',
    due_date: dueDateStr || '',
    ...extra,
  };
}
