/**
 * Document requests — practice asks a client for specific documents; the
 * client satisfies them through the portal. The request email carries the
 * portal link (auto-minted), which is the client's path into the portal.
 */
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import { createClientPortalLink } from './proposalSharingService.js';
import { tenantMailerSend } from './tenantMailer.js';

export interface DocumentRequestItemInput {
  name: string;
  required?: boolean;
}

const REQUEST_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  client: { select: { id: true, name: true, contactName: true, contactEmail: true } },
  job: { select: { id: true, title: true, reference: true } },
} as const;

function requestProgress(request: { items: { required: boolean; status: string }[] }) {
  const required = request.items.filter((i) => i.required);
  const receivedRequired = required.filter((i) => i.status === 'RECEIVED');
  const received = request.items.filter((i) => i.status === 'RECEIVED');
  return {
    itemsTotal: request.items.length,
    itemsReceived: received.length,
    requiredTotal: required.length,
    requiredReceived: receivedRequired.length,
  };
}

export function serializeDocumentRequest(request: any) {
  return {
    id: request.id,
    title: request.title,
    message: request.message,
    status: request.status,
    sentCount: request.sentCount,
    lastSentAt: request.lastSentAt,
    completedAt: request.completedAt,
    createdAt: request.createdAt,
    client: request.client,
    job: request.job,
    items: request.items.map((i: any) => ({
      id: i.id,
      name: i.name,
      required: i.required,
      status: i.status,
      receivedAt: i.receivedAt,
    })),
    progress: requestProgress(request),
  };
}

async function logRequestActivity(opts: {
  tenantId: string;
  requestId: string;
  action: string;
  description: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.activityLog.create({
    data: {
      action: opts.action,
      entityType: 'DOCUMENT_REQUEST',
      entityId: opts.requestId,
      description: opts.description,
      metadata: JSON.stringify(opts.metadata || {}),
      tenantId: opts.tenantId,
      userId: opts.userId || null,
    },
  });
}

function requestEmailHtml(opts: {
  practiceName: string;
  contactName: string | null;
  clientName: string;
  title: string;
  message: string | null;
  items: { name: string; required: boolean }[];
  portalUrl: string;
}): string {
  const greetName = opts.contactName || opts.clientName;
  const itemsHtml = opts.items
    .map(
      (i) =>
        `<li style="margin:4px 0;">${i.name}${i.required ? '' : ' <span style="color:#94a3b8;">(if available)</span>'}</li>`
    )
    .join('');
  const messageHtml = opts.message
    ? `<p style="margin:16px 0;white-space:pre-line;">${opts.message}</p>`
    : '';
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
  <p>Dear ${greetName},</p>
  <p>${opts.practiceName} has requested the following documents for <strong>${opts.title}</strong>:</p>
  <ul style="padding-left:20px;">${itemsHtml}</ul>
  ${messageHtml}
  <p style="margin:24px 0;">
    <a href="${opts.portalUrl}" style="background:#0ea5e9;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
      Upload documents securely
    </a>
  </p>
  <p style="font-size:13px;color:#475569;">The link opens your secure client portal — no login needed. You can upload each document against the list above and see what is still outstanding.</p>
</div>`;
}

async function sendRequestEmail(opts: {
  tenantId: string;
  request: any;
  frontendOrigin?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const { request } = opts;
  if (!request.client.contactEmail) {
    return { sent: false, error: 'Client has no contact email' };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: opts.tenantId },
    select: { name: true },
  });
  if (!tenant) return { sent: false, error: 'Tenant not found' };

  const link = await createClientPortalLink(request.client.id, 90, opts.frontendOrigin);

  const result = await tenantMailerSend({
    tenantId: opts.tenantId,
    messageType: 'DOCUMENT_REQUEST',
    message: {
      to: request.client.contactEmail,
      subject: `${tenant.name}: documents needed — ${request.title}`,
      html: requestEmailHtml({
        practiceName: tenant.name,
        contactName: request.client.contactName,
        clientName: request.client.name,
        title: request.title,
        message: request.message,
        items: request.items,
        portalUrl: link.portalUrl,
      }),
    },
    relatedIds: { clientId: request.client.id },
  });

  if (!result.success) {
    logger.warn(`Document request email failed for ${request.id}: ${result.error}`);
    return { sent: false, error: result.error };
  }
  return { sent: true };
}

export async function createDocumentRequest(opts: {
  tenantId: string;
  clientId: string;
  jobId?: string | null;
  title: string;
  message?: string | null;
  items: DocumentRequestItemInput[];
  createdById?: string | null;
  send: boolean;
  frontendOrigin?: string;
}) {
  const client = await prisma.client.findFirst({
    where: { id: opts.clientId, tenantId: opts.tenantId },
    select: { id: true },
  });
  if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

  if (opts.jobId) {
    const job = await prisma.job.findFirst({
      where: { id: opts.jobId, clientId: opts.clientId, tenantId: opts.tenantId },
      select: { id: true },
    });
    if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);
  }

  if (!opts.items.length) {
    throw new ApiError('VALIDATION', 'At least one document item is required', 400);
  }

  const duplicate = await prisma.documentRequest.findFirst({
    where: {
      tenantId: opts.tenantId,
      clientId: opts.clientId,
      title: opts.title,
      status: 'OPEN',
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new ApiError(
      'DUPLICATE_REQUEST',
      'An open request with this title already exists for this client — resend it or use a different title.',
      409
    );
  }

  const created = await prisma.documentRequest.create({
    data: {
      title: opts.title,
      message: opts.message || null,
      tenantId: opts.tenantId,
      clientId: opts.clientId,
      jobId: opts.jobId || null,
      createdById: opts.createdById || null,
      items: {
        create: opts.items.map((item, idx) => ({
          name: item.name,
          required: item.required !== false,
          sortOrder: idx,
        })),
      },
    },
    include: REQUEST_INCLUDE,
  });

  await logRequestActivity({
    tenantId: opts.tenantId,
    requestId: created.id,
    action: 'DOCUMENT_REQUEST_CREATED',
    description: `Document request “${created.title}” created for ${created.client.name}`,
    userId: opts.createdById,
    metadata: { clientId: opts.clientId, items: opts.items.length },
  });

  let sendResult: { sent: boolean; error?: string } = { sent: false };
  if (opts.send) {
    sendResult = await sendRequestEmail({
      tenantId: opts.tenantId,
      request: created,
      frontendOrigin: opts.frontendOrigin,
    });
    if (sendResult.sent) {
      await prisma.documentRequest.update({
        where: { id: created.id },
        data: { sentCount: { increment: 1 }, lastSentAt: new Date() },
      });
      await logRequestActivity({
        tenantId: opts.tenantId,
        requestId: created.id,
        action: 'DOCUMENT_REQUEST_SENT',
        description: `Document request “${created.title}” emailed to ${created.client.name}`,
        userId: opts.createdById,
      });
    }
  }

  const fresh = await prisma.documentRequest.findUnique({
    where: { id: created.id },
    include: REQUEST_INCLUDE,
  });
  return {
    request: serializeDocumentRequest(fresh),
    emailSent: sendResult.sent,
    emailError: sendResult.error,
  };
}

export async function resendDocumentRequest(opts: {
  tenantId: string;
  requestId: string;
  actorId?: string | null;
  frontendOrigin?: string;
}) {
  const request = await prisma.documentRequest.findFirst({
    where: { id: opts.requestId, tenantId: opts.tenantId },
    include: REQUEST_INCLUDE,
  });
  if (!request) throw new ApiError('NOT_FOUND', 'Document request not found', 404);
  if (request.status !== 'OPEN') {
    throw new ApiError('INVALID_STATUS', 'Only open requests can be resent', 400);
  }

  const sendResult = await sendRequestEmail({
    tenantId: opts.tenantId,
    request,
    frontendOrigin: opts.frontendOrigin,
  });
  if (!sendResult.sent) {
    throw new ApiError('EMAIL_FAILED', sendResult.error || 'Email could not be sent', 502);
  }

  await prisma.documentRequest.update({
    where: { id: request.id },
    data: { sentCount: { increment: 1 }, lastSentAt: new Date() },
  });
  await logRequestActivity({
    tenantId: opts.tenantId,
    requestId: request.id,
    action: 'DOCUMENT_REQUEST_SENT',
    description: `Document request “${request.title}” re-sent to ${request.client.name}`,
    userId: opts.actorId,
    metadata: { resend: true },
  });

  const fresh = await prisma.documentRequest.findUnique({
    where: { id: request.id },
    include: REQUEST_INCLUDE,
  });
  return serializeDocumentRequest(fresh);
}

export async function listDocumentRequests(opts: {
  tenantId: string;
  clientId?: string;
  status?: 'OPEN' | 'COMPLETE' | 'CANCELLED';
}) {
  const requests = await prisma.documentRequest.findMany({
    where: {
      tenantId: opts.tenantId,
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return requests.map(serializeDocumentRequest);
}

export async function cancelDocumentRequest(opts: {
  tenantId: string;
  requestId: string;
  actorId?: string | null;
}) {
  const request = await prisma.documentRequest.findFirst({
    where: { id: opts.requestId, tenantId: opts.tenantId },
    include: REQUEST_INCLUDE,
  });
  if (!request) throw new ApiError('NOT_FOUND', 'Document request not found', 404);
  if (request.status === 'CANCELLED') return serializeDocumentRequest(request);

  const updated = await prisma.documentRequest.update({
    where: { id: request.id },
    data: { status: 'CANCELLED' },
    include: REQUEST_INCLUDE,
  });
  await logRequestActivity({
    tenantId: opts.tenantId,
    requestId: request.id,
    action: 'DOCUMENT_REQUEST_CANCELLED',
    description: `Document request “${request.title}” cancelled`,
    userId: opts.actorId,
  });
  return serializeDocumentRequest(updated);
}

/** Staff manually marks an item received (e.g. document arrived by email/post). */
export async function overrideItemStatus(opts: {
  tenantId: string;
  requestId: string;
  itemId: string;
  status: 'PENDING' | 'RECEIVED';
  actorId?: string | null;
}) {
  const item = await prisma.documentRequestItem.findFirst({
    where: {
      id: opts.itemId,
      requestId: opts.requestId,
      request: { tenantId: opts.tenantId },
    },
    include: { request: { select: { id: true, title: true, status: true } } },
  });
  if (!item) throw new ApiError('NOT_FOUND', 'Document request item not found', 404);
  if (item.request.status === 'CANCELLED') {
    throw new ApiError('INVALID_STATUS', 'Request is cancelled', 400);
  }

  await prisma.documentRequestItem.update({
    where: { id: item.id },
    data: {
      status: opts.status,
      receivedAt: opts.status === 'RECEIVED' ? new Date() : null,
    },
  });
  await logRequestActivity({
    tenantId: opts.tenantId,
    requestId: opts.requestId,
    action: 'DOCUMENT_REQUEST_ITEM_OVERRIDE',
    description: `“${item.name}” manually marked ${opts.status.toLowerCase()}`,
    userId: opts.actorId,
    metadata: { itemId: item.id, status: opts.status },
  });

  await maybeCompleteRequest(opts.tenantId, opts.requestId);

  const fresh = await prisma.documentRequest.findUnique({
    where: { id: opts.requestId },
    include: REQUEST_INCLUDE,
  });
  return serializeDocumentRequest(fresh);
}

/**
 * Portal upload satisfied an item. Validates the item belongs to an OPEN
 * request of this client (token-scoped caller). Returns the request id when
 * the item was attached.
 */
export async function attachUploadToRequestItem(opts: {
  tenantId: string;
  clientId: string;
  requestItemId: string;
  portalFileId: string;
}): Promise<{ requestId: string } | null> {
  const item = await prisma.documentRequestItem.findFirst({
    where: {
      id: opts.requestItemId,
      request: {
        tenantId: opts.tenantId,
        clientId: opts.clientId,
        status: 'OPEN',
      },
    },
    include: { request: { select: { id: true, title: true } } },
  });
  if (!item) return null;

  await prisma.portalFile.update({
    where: { id: opts.portalFileId },
    data: { requestItemId: item.id },
  });
  await prisma.documentRequestItem.update({
    where: { id: item.id },
    data: { status: 'RECEIVED', receivedAt: new Date() },
  });
  await logRequestActivity({
    tenantId: opts.tenantId,
    requestId: item.request.id,
    action: 'DOCUMENT_REQUEST_ITEM_RECEIVED',
    description: `Client uploaded “${item.name}” for “${item.request.title}”`,
    metadata: { itemId: item.id, portalFileId: opts.portalFileId },
  });

  await maybeCompleteRequest(opts.tenantId, item.request.id);
  return { requestId: item.request.id };
}

async function maybeCompleteRequest(tenantId: string, requestId: string): Promise<void> {
  const request = await prisma.documentRequest.findFirst({
    where: { id: requestId, tenantId },
    include: { items: true, client: { select: { name: true } } },
  });
  if (!request || request.status !== 'OPEN') return;

  const allRequiredReceived = request.items
    .filter((i) => i.required)
    .every((i) => i.status === 'RECEIVED');
  if (!allRequiredReceived || request.items.length === 0) return;

  await prisma.documentRequest.update({
    where: { id: request.id },
    data: { status: 'COMPLETE', completedAt: new Date() },
  });
  await logRequestActivity({
    tenantId,
    requestId: request.id,
    action: 'DOCUMENT_REQUEST_COMPLETED',
    description: `All required documents received for “${request.title}” (${request.client.name})`,
  });
}

/** Portal payload: open requests + items for the client, oldest first. */
export async function listOpenRequestsForPortal(tenantId: string, clientId: string) {
  const requests = await prisma.documentRequest.findMany({
    where: { tenantId, clientId, status: 'OPEN' },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  return requests.map((r) => ({
    id: r.id,
    title: r.title,
    message: r.message,
    createdAt: r.createdAt,
    items: r.items.map((i) => ({
      id: i.id,
      name: i.name,
      required: i.required,
      status: i.status,
    })),
  }));
}
