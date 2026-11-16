// Builds the single service worker after `next build` (SPEC-801 ET-2). Turbopack is the default
// bundler of Next 16 and does not run webpack plugins, so the worker is compiled here with
// esbuild: `app/sw.ts` plus the precache manifest of `/_next/static` and the two static offline
// pages. The output is `public/sw.js`, registered at scope `/` (ignored by Git).
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const STATIC = path.join(WEB, '.next/static');

async function walk(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path.join(dir, entry.name), relative)));
    else files.push(relative);
  }
  return files;
}

function revisionOf(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

async function precacheManifest() {
  const entries = [];
  if (existsSync(STATIC)) {
    for (const relative of await walk(STATIC)) {
      const file = path.join(STATIC, relative);
      const buffer = await readFile(file);
      entries.push({ url: `/_next/static/${relative}`, revision: revisionOf(buffer) });
    }
  }
  const pages = [
    '/hors-ligne',
    '/hors-ligne/revisions',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png',
    '/icons/apple-touch-icon.png',
    '/icons/notification.png',
    '/manifest.webmanifest',
  ];
  for (const url of pages) {
    const file = path.join(WEB, 'public', url);
    if (!existsSync(file)) {
      entries.push({ url, revision: null });
      continue;
    }
    entries.push({ url, revision: revisionOf(await readFile(file)) });
  }
  return entries;
}

export async function buildServiceWorker() {
  const manifest = await precacheManifest();
  await build({
    entryPoints: [path.join(WEB, 'app/sw.ts')],
    outfile: path.join(WEB, 'public/sw.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    sourcemap: false,
    define: {
      __SW_MANIFEST: JSON.stringify(manifest),
      'process.env.NODE_ENV': '"production"',
      'process.env.CLOCK_FIXED_AT': 'undefined',
      'process.env': '__LEARNY_ENV__',
    },
    banner: { js: 'var __LEARNY_ENV__={NODE_ENV:"production"};' },
    logLevel: 'warning',
  });
  return manifest.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const count = await buildServiceWorker();
  await writeFile(
    path.join(WEB, 'public/swe-worker-build.txt'),
    `service worker généré (${String(count)} entrées de précache)\n`,
    'utf8',
  );
  process.stdout.write(`✔ public/sw.js généré (${String(count)} entrées)\n`);
}
