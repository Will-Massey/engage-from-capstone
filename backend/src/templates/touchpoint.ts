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

export interface TouchpointMergeContext {
  client_name: string;
  contact_name?: string;
  practice_name: string;
  next_step?: string;
  due_date?: string; // pre-formatted
  [key: string]: string | undefined;
}

export function renderTouchpointTemplate(body: string, context: TouchpointMergeContext): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = context[key];
    return value !== undefined ? String(value) : '';
  });
}

export function renderTouchpointSubject(subject: string, context: TouchpointMergeContext): string {
  return renderTouchpointTemplate(subject, context);
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
