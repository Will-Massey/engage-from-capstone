/**
 * Portal OS — client tasks + messages without a new Prisma model.
 * Stored as ActivityLog rows (entityType CLIENT, action PORTAL_TASK | PORTAL_MESSAGE).
 */

import { prisma } from '../config/database.js';

export type PortalTask = {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
  createdAt: string;
  from: 'staff' | 'client';
  authorName?: string;
};

export type PortalMessage = {
  id: string;
  body: string;
  createdAt: string;
  from: 'staff' | 'client';
  authorName?: string;
};

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function listPortalTasks(tenantId: string, clientId: string): Promise<PortalTask[]> {
  const rows = await prisma.activityLog.findMany({
    where: {
      tenantId,
      entityType: 'CLIENT',
      entityId: clientId,
      action: 'PORTAL_TASK',
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => {
    const m = parseMeta(r.metadata);
    return {
      id: r.id,
      title: r.description || 'Task',
      done: m.done === true,
      dueAt: typeof m.dueAt === 'string' ? m.dueAt : null,
      createdAt: r.createdAt.toISOString(),
      from: m.from === 'client' ? 'client' : 'staff',
      authorName: typeof m.authorName === 'string' ? m.authorName : undefined,
    };
  });
}

export async function listPortalMessages(
  tenantId: string,
  clientId: string
): Promise<PortalMessage[]> {
  const rows = await prisma.activityLog.findMany({
    where: {
      tenantId,
      entityType: 'CLIENT',
      entityId: clientId,
      action: 'PORTAL_MESSAGE',
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return rows.map((r) => {
    const m = parseMeta(r.metadata);
    return {
      id: r.id,
      body: r.description || '',
      createdAt: r.createdAt.toISOString(),
      from: m.from === 'client' ? 'client' : 'staff',
      authorName: typeof m.authorName === 'string' ? m.authorName : undefined,
    };
  });
}

export async function createPortalTask(params: {
  tenantId: string;
  clientId: string;
  title: string;
  dueAt?: string | null;
  from: 'staff' | 'client';
  authorName?: string;
  userId?: string | null;
}): Promise<PortalTask> {
  const row = await prisma.activityLog.create({
    data: {
      tenantId: params.tenantId,
      entityType: 'CLIENT',
      entityId: params.clientId,
      action: 'PORTAL_TASK',
      description: params.title.slice(0, 500),
      metadata: JSON.stringify({
        done: false,
        dueAt: params.dueAt || null,
        from: params.from,
        authorName: params.authorName || null,
      }),
      userId: params.userId || null,
    },
  });
  return {
    id: row.id,
    title: row.description || params.title,
    done: false,
    dueAt: params.dueAt || null,
    createdAt: row.createdAt.toISOString(),
    from: params.from,
    authorName: params.authorName,
  };
}

export async function setPortalTaskDone(params: {
  tenantId: string;
  clientId: string;
  taskId: string;
  done: boolean;
}): Promise<PortalTask | null> {
  const row = await prisma.activityLog.findFirst({
    where: {
      id: params.taskId,
      tenantId: params.tenantId,
      entityType: 'CLIENT',
      entityId: params.clientId,
      action: 'PORTAL_TASK',
    },
  });
  if (!row) return null;
  const m = parseMeta(row.metadata);
  m.done = params.done;
  const updated = await prisma.activityLog.update({
    where: { id: row.id },
    data: { metadata: JSON.stringify(m) },
  });
  return {
    id: updated.id,
    title: updated.description || 'Task',
    done: params.done,
    dueAt: typeof m.dueAt === 'string' ? m.dueAt : null,
    createdAt: updated.createdAt.toISOString(),
    from: m.from === 'client' ? 'client' : 'staff',
    authorName: typeof m.authorName === 'string' ? m.authorName : undefined,
  };
}

export async function createPortalMessage(params: {
  tenantId: string;
  clientId: string;
  body: string;
  from: 'staff' | 'client';
  authorName?: string;
  userId?: string | null;
}): Promise<PortalMessage> {
  const row = await prisma.activityLog.create({
    data: {
      tenantId: params.tenantId,
      entityType: 'CLIENT',
      entityId: params.clientId,
      action: 'PORTAL_MESSAGE',
      description: params.body.slice(0, 4000),
      metadata: JSON.stringify({
        from: params.from,
        authorName: params.authorName || null,
      }),
      userId: params.userId || null,
    },
  });
  return {
    id: row.id,
    body: row.description || params.body,
    createdAt: row.createdAt.toISOString(),
    from: params.from,
    authorName: params.authorName,
  };
}
