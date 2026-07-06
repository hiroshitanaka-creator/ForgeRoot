// Test loader: copies the TypeScript sources to a temp dir as plain ESM
// (the sources only use `: any` annotations) so node:test can import them
// without a build step. All four modules land in one directory so the
// relative ./contract.js import keeps resolving.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'forgeroot-memory-'));
for (const name of ['contract', 'working', 'digest', 'packer']) {
  const src = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8')
    .replace(/: any/g, '')
    .replace(/\.\/contract\.js/g, './contract.mjs')
    .replace(/\.\/digest\.js/g, './digest.mjs');
  writeFileSync(join(dir, `${name}.mjs`), src);
}

export const working = await import(pathToFileURL(join(dir, 'working.mjs')).href);
export const digest = await import(pathToFileURL(join(dir, 'digest.mjs')).href);
export const packer = await import(pathToFileURL(join(dir, 'packer.mjs')).href);
