/**
 * When VITE_APP_BASE is /engage, Vite emits asset URLs as /engage/assets/...
 * Render static hosting serves files from dist root, so we nest the build under dist/engage/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const rawBase = (process.env.VITE_APP_BASE || '/').replace(/\/$/, '');
const segment = rawBase.replace(/^\//, '');

if (!segment) {
  console.log('[prepare-static-engage] VITE_APP_BASE is root — no restructure needed');
  process.exit(0);
}

const publishRoot = path.join(distDir, '..', 'dist-publish');
const nestedDir = path.join(publishRoot, segment);

if (fs.existsSync(publishRoot)) {
  fs.rmSync(publishRoot, { recursive: true, force: true });
}
fs.mkdirSync(nestedDir, { recursive: true });

for (const entry of fs.readdirSync(distDir)) {
  fs.cpSync(path.join(distDir, entry), path.join(nestedDir, entry), { recursive: true });
}

// Capstonesoftware.co.uk/engage strips the /engage prefix when fetching from Render —
// so /engage/login becomes origin /login. Serve the SPA at root + nested paths.
const spaIndex = path.join(nestedDir, 'index.html');
fs.cpSync(spaIndex, path.join(publishRoot, 'index.html'));

const redirects = [
  `/${segment}/*  /${segment}/index.html  200`,
  '/*            /index.html  200',
].join('\n');
fs.writeFileSync(path.join(publishRoot, '_redirects'), `${redirects}\n`, 'utf8');

fs.rmSync(distDir, { recursive: true, force: true });
fs.renameSync(publishRoot, distDir);

console.log(`[prepare-static-engage] Published SPA under /${segment}/ (${nestedDir})`);