#!/usr/bin/env node
/**
 * Checks the App Store listing copy in docs/ios-listing-copy.md against Apple's
 * field limits, and against the metadata rules this portfolio has already been
 * rejected under.
 *
 * App Store Connect silently truncates or refuses over-long fields at submission
 * time, which is a slow way to find out. Run this after editing the copy.
 *
 *   node scripts/check-listing-copy.mjs
 */
import { readFileSync } from 'node:fs';

const doc = readFileSync(new URL('../docs/ios-listing-copy.md', import.meta.url), 'utf8');

/** Value from a `| Field | \`value\` |` table row. */
function tableValue(field) {
  const row = new RegExp(`\\|\\s*${field}\\s*\\|\\s*\`([^\`]+)\``).exec(doc);
  return row?.[1] ?? null;
}

/** First fenced block following a `## Heading`. */
function section(heading) {
  const start = doc.indexOf(`## ${heading}`);
  if (start === -1) return null;
  const open = doc.indexOf('```', start);
  const close = doc.indexOf('```', open + 3);
  if (open === -1 || close === -1) return null;
  return doc
    .slice(open + 3, close)
    .replace(/^\w*\n/, '')
    .trim();
}

const LIMITS = { name: 30, subtitle: 30, keywords: 100, promo: 170, description: 4000 };

const fields = [
  ['App name', tableValue('App name'), LIMITS.name],
  ['Subtitle', tableValue('Subtitle'), LIMITS.subtitle],
  ['Keywords', section('Keywords'), LIMITS.keywords],
  ['Promotional text', section('Promotional text'), LIMITS.promo],
  ['Description', section('Description'), LIMITS.description],
];

let failed = false;
for (const [label, value, limit] of fields) {
  if (value === null) {
    console.error(`MISSING  ${label} — could not find it in the document`);
    failed = true;
    continue;
  }
  const n = [...value].length; // count characters, not UTF-16 code units
  const ok = n <= limit;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'OVER'}  ${label.padEnd(18)} ${String(n).padStart(4)} / ${limit}`);
}

// Tax-authority names in metadata read as implying an official connection.
// Footnote was rejected under 4.1(a) in July 2026 for exactly this.
const RISKY = ['HMRC', 'GOV.UK', 'GOV UK'];
for (const [label, value] of [
  ['App name', tableValue('App name')],
  ['Subtitle', tableValue('Subtitle')],
  ['Keywords', section('Keywords')],
]) {
  for (const term of RISKY) {
    if (value && value.toUpperCase().includes(term)) {
      console.error(`RISK  ${label} contains "${term}" — 4.1(a) rejection risk, remove it`);
      failed = true;
    }
  }
}

// Apple rejects metadata naming other platforms.
const OTHER_PLATFORMS = /\b(android|google play|windows phone)\b/i;
const description = section('Description') ?? '';
if (OTHER_PLATFORMS.test(description)) {
  console.error('RISK  Description names another platform — Apple rejects this');
  failed = true;
}

console.log(failed ? '\nFAILED' : '\nAll listing fields are within limits.');
process.exit(failed ? 1 : 0);
