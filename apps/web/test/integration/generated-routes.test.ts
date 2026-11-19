// SPEC-1004 §12 (CA-3, CA-4) — les routes générées se chargent et délèguent bien aux tables : chaque
// fichier ne contient qu'une délégation, chaque route du registre a sa méthode exportée, et la
// route de santé répond au travers du module Next (jamais 404 ni 405).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SPECIAL_HANDLERS } from '@learny/api-routes';
import { ROUTES } from '@learny/contracts';

const APP = fileURLToPath(new URL('../../app', import.meta.url));
const API = path.join(APP, 'api');
const modules = import.meta.glob('../../app/api/**/route.ts');

const METHODS = ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'];

function routeFiles(): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') {
        found.push(path.relative(APP, full).split(path.sep).join('/'));
      }
    }
  };
  walk(API);
  return found.sort();
}

/** `api/v1/formations/:fid` → `api/v1/formations/[fid]`, `_dev` → `%5Fdev`. */
function routeFileOf(routePath: string): string {
  const segments = routePath
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => {
      if (segment.startsWith(':')) return `[${segment.slice(1)}]`;
      return segment === '_dev' ? '%5Fdev' : segment;
    });
  return `${segments.join('/')}/route.ts`;
}

describe('[SPEC-1004] generated routes', () => {
  it('ne contient aucune logique dans les fichiers générés (CA-4)', () => {
    const files = routeFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const relative of files) {
      const source = fs.readFileSync(path.join(APP, relative), 'utf8');
      for (const line of source.split('\n')) {
        if (line.startsWith('import ')) continue;
        if (line.startsWith('//') || line === '') continue;
        if (/^export const (dynamic|runtime|maxDuration) = /.test(line)) continue;
        expect(line, `${relative}: ${line}`).toMatch(
          /^export const (GET|POST|PUT|PATCH|DELETE) = (nextRoute|nextSpecial)\('[\w.]+'\);$/,
        );
      }
      expect(source.match(/^import .*$/gm) ?? [], relative).toHaveLength(1);
    }
  });

  it('exporte la méthode de chaque route du registre (CA-3)', async () => {
    for (const [key, route] of Object.entries(ROUTES)) {
      const file = routeFileOf(route.path);
      const load = modules[`../../app/${file}`];
      if (load === undefined) throw new Error(`module généré absent : ${file} (${key})`);
      const routeModule = (await load()) as Record<string, unknown>;
      const special = (SPECIAL_HANDLERS as Record<string, { method: string } | undefined>)[key];
      const method = special?.method === 'ALL' ? 'GET' : route.method;
      expect(typeof routeModule[method], `${file}#${method}`).toBe('function');
    }
  });

  it('sert la route de santé au travers du module Next, jamais 404 ni 405 (CA-3)', async () => {
    const load = modules['../../app/api/v1/health/route.ts'];
    if (load === undefined) throw new Error('module généré absent : api/v1/health/route.ts');
    const routeModule = (await load()) as Record<string, unknown>;
    const get = routeModule.GET;
    expect(typeof get).toBe('function');
    const response = await (get as (request?: Request) => Promise<Response>)();
    expect([200, 503]).toContain(response.status);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('expose chaque méthode déclarée par le fichier généré', () => {
    for (const [file, load] of Object.entries(modules)) {
      expect(load, file).toBeTypeOf('function');
      const source = fs.readFileSync(path.join(APP, file.replace('../../app/', '')), 'utf8');
      const exported = METHODS.filter((method) => source.includes(`export const ${method} = `));
      expect(exported.length, file).toBeGreaterThan(0);
    }
  });
});
