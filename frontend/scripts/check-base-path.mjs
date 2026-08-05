#!/usr/bin/env node
/**
 * Regression check: the generated frontend bundle must reference /frontend/assets/.
 *
 * The Windows portable package mounts frontend/dist below /frontend/ in FastAPI.
 * If Vite's `base` is missing/incorrect, index.html points at /assets/... and the
 * app renders a blank page (JS + CSS return 404).
 *
 * Never fix this by hand-editing dist/index.html - fix `base` in vite.config.ts.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_BASE = '/frontend/';
const here = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(here, '..', 'dist', 'index.html');

if (!existsSync(indexPath)) {
  console.error(`[check-base-path] FAIL: ${indexPath} not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const assetRefs = refs.filter((r) => r.includes('assets/'));

if (assetRefs.length === 0) {
  console.error('[check-base-path] FAIL: no asset references found in dist/index.html.');
  process.exit(1);
}

const bad = assetRefs.filter((r) => !r.startsWith(`${EXPECTED_BASE}assets/`));
if (bad.length > 0) {
  console.error('[check-base-path] FAIL: asset references are not prefixed with /frontend/:');
  for (const r of bad) console.error(`  ${r}`);
  console.error('Fix: set `base: \'/frontend/\'` in frontend/vite.config.ts and rebuild.');
  process.exit(1);
}

console.log(`[check-base-path] OK: ${assetRefs.length} asset reference(s) use ${EXPECTED_BASE}assets/`);
for (const r of assetRefs) console.log(`  ${r}`);
