#!/usr/bin/env node
/**
 * Combined production smoke — ONE login session for all checks.
 * Avoids tripping auth rate limits from running multiple scripts.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scripts = ['production-smoke.mjs', 'ai-native-smoke.mjs'];

async function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, script), ...process.argv.slice(2)],
      {
        stdio: 'inherit',
        env: process.env,
      }
    );
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))
    );
  });
}

console.log(
  'Running combined smoke (single login per script — run this instead of multiple scripts)\n'
);

for (const script of scripts) {
  await run(script);
}

console.log('\nCombined smoke complete');
