// Writes (or checks) apps/web/public/openapi.json (SPEC-201 ET-8). `--check` fails on any drift.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROUTES, buildOpenApiDocument, serializeOpenApiDocument } from '../src/index';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const target = resolve(root, 'apps/web/public/openapi.json');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version?: string;
};

const content = serializeOpenApiDocument(
  buildOpenApiDocument(ROUTES, { version: version ?? '0.0.0' }),
);

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // missing file: reported below
  }
  if (current !== content) {
    console.error('✖ apps/web/public/openapi.json est périmé : lancer pnpm openapi:generate');
    process.exit(1);
  }
  console.log('✔ openapi.json à jour');
} else {
  writeFileSync(target, content);
  console.log(`✔ ${target}`);
}
