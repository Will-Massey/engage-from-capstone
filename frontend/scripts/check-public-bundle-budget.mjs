#!/usr/bin/env node
/**
 * After `vite build`, assert the entry chunk's static vendor graph stays within
 * budget. Lazy route + lazy-only vendors (recharts, stripe) are excluded —
 * they load only when those routes mount.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '../dist/assets');
const BUDGET_KB = Number(process.env.PUBLIC_ROUTE_BUDGET_KB || 300);

if (!fs.existsSync(distDir)) {
  console.error('check-public-bundle-budget: dist/assets missing — run vite build first');
  process.exit(1);
}

const gzipKb = (filePath) => {
  const raw = fs.readFileSync(filePath);
  return zlib.gzipSync(raw).length / 1024;
};

/** Walk static `from"./chunk.js"` imports starting at the entry chunk. */
function collectStaticChunks(entryFile, visited = new Set()) {
  const name = path.basename(entryFile);
  if (visited.has(name)) return visited;
  visited.add(name);

  const src = fs.readFileSync(entryFile, 'utf8');
  for (const match of src.matchAll(/from"\.\/([^"]+\.js)"/g)) {
    const dep = path.join(distDir, match[1]);
    if (fs.existsSync(dep)) collectStaticChunks(dep, visited);
  }
  return visited;
}

const jsFiles = fs
  .readdirSync(distDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ name: f, path: path.join(distDir, f), kb: gzipKb(path.join(distDir, f)) }));

const entry = jsFiles.find((f) => f.name.startsWith('index-') && f.kb > 20);
if (!entry) {
  console.error('check-public-bundle-budget: main index-*.js entry chunk not found');
  process.exit(1);
}

const staticChunkNames = collectStaticChunks(entry.path);
const staticChunks = jsFiles.filter((f) => staticChunkNames.has(f.name));
const staticKb = staticChunks.reduce((sum, f) => sum + f.kb, 0);

const proposalView = jsFiles.find((f) => f.name.startsWith('ProposalView-'));
const publicRouteKb = staticKb + (proposalView?.kb ?? 0);

console.log('Bundle budget (entry static graph + lazy ProposalView chunk):');
for (const c of staticChunks.sort((a, b) => b.kb - a.kb)) {
  console.log(`  ${c.name}: ${c.kb.toFixed(1)} KB gzip`);
}
if (proposalView) {
  console.log(`  ${proposalView.name}: ${proposalView.kb.toFixed(1)} KB gzip (lazy public sign)`);
}
console.log(`  total: ${publicRouteKb.toFixed(1)} KB gzip (budget ${BUDGET_KB} KB)`);

const lazyOnly = jsFiles.filter(
  (f) => !staticChunkNames.has(f.name) && !f.name.startsWith('ProposalView-')
);
if (lazyOnly.length > 0) {
  console.log(`  (${lazyOnly.length} additional lazy route/vendor chunks not in baseline)`);
}

if (publicRouteKb > BUDGET_KB) {
  console.error(
    `FAIL: public route baseline ${publicRouteKb.toFixed(1)} KB exceeds ${BUDGET_KB} KB`
  );
  process.exit(1);
}

console.log('PASS: public route baseline within budget');
