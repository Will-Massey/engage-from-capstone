/**
 * Load ICAEW/ACCA-aligned engagement clause packages from backend/data/engagement-clauses/
 */
import fs from 'fs';
import path from 'path';
import type { EngagementClause } from './engagementClauseLibrary.js';

const CLAUSES_DIR = path.resolve(process.cwd(), 'data', 'engagement-clauses');

export function loadEngagementClausePackages(): EngagementClause[] {
  if (!fs.existsSync(CLAUSES_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(CLAUSES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const clauses: EngagementClause[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(CLAUSES_DIR, file), 'utf8');
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : parsed.clauses || [parsed];

      for (const item of items) {
        if (!item?.id || !item?.title || !item?.body) continue;
        clauses.push({
          id: String(item.id),
          title: String(item.title),
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
          body: String(item.body),
        });
      }
    } catch (err) {
      console.warn(`[EngagementClauses] Skipped ${file}:`, err);
    }
  }

  return clauses;
}
