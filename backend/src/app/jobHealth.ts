/**
 * Module-level health registry for the background interval jobs, so job
 * outcomes are visible on /api/status instead of logs-only.
 */

export interface JobHealthEntry {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

const registry = new Map<string, JobHealthEntry>();

function entryFor(name: string): JobHealthEntry {
  let entry = registry.get(name);
  if (!entry) {
    entry = { lastRunAt: null, lastSuccessAt: null, lastError: null };
    registry.set(name, entry);
  }
  return entry;
}

/** Run a job tick, recording lastRunAt/lastSuccessAt/lastError. Re-throws on failure. */
export async function trackJobRun(name: string, run: () => Promise<unknown>): Promise<void> {
  const entry = entryFor(name);
  entry.lastRunAt = new Date().toISOString();
  try {
    await run();
    entry.lastSuccessAt = new Date().toISOString();
    entry.lastError = null;
  } catch (err) {
    entry.lastError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/** Snapshot of every registered job's health. */
export function getJobHealth(): Record<string, JobHealthEntry> {
  const snapshot: Record<string, JobHealthEntry> = {};
  for (const [name, entry] of registry) {
    snapshot[name] = { ...entry };
  }
  return snapshot;
}

/** Test helper — clear all recorded job health. */
export function resetJobHealth(): void {
  registry.clear();
}
