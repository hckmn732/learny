import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { perfFormationId, perfUserId } from '../perf-identifiers';

const SCRIPT = fs.readFileSync(
  fileURLToPath(new URL('../k6/api-load.js', import.meta.url)),
  'utf8',
);

describe('[SPEC-804] seuils et scénario k6', () => {
  it('répartit 100 % des requêtes sur les 10 routes sans IA', () => {
    const weights = [...SCRIPT.matchAll(/weight:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(weights).toHaveLength(10);
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBe(100);
    expect(SCRIPT).not.toContain('/tutor');
    expect(SCRIPT).not.toContain('/generation');
  });

  it('déclare les seuils p95, échecs et 429', () => {
    expect(SCRIPT).toContain("http_req_duration: ['p(95)<300']");
    expect(SCRIPT).toContain("http_req_failed: ['rate<0.01']");
    expect(SCRIPT).toMatch(/status_429: \['count==0'\]/);
    expect(SCRIPT).toContain('50');
    expect(SCRIPT).toContain("duration: '2m'");
  });

  it('nomme chaque route pour les seuils par route', () => {
    for (const name of [
      'home',
      'unread_count',
      'agenda',
      'notifications',
      'programme',
      'global_quiz_today',
      'gaps',
      'notion_graph',
      'search',
      'notifications_read_all',
    ]) {
      expect(SCRIPT).toContain(`'${name}'`);
      expect(SCRIPT).toMatch(/route_\$\{route\.name\}_duration/);
    }
  });

  it('associe chaque VU à sa formation sans mélanger les propriétaires', () => {
    expect(SCRIPT).toContain('session?.formationId');
    expect(SCRIPT).toContain('session?.cookie');
    expect(perfUserId(1)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(perfFormationId(1)).not.toBe(perfFormationId(2));
  });
});

describe('[SPEC-804] fichiers de mesure', () => {
  it('fige la version k6 dans tools/perf/k6-version.txt', () => {
    const version = fs
      .readFileSync(fileURLToPath(new URL('../k6-version.txt', import.meta.url)), 'utf8')
      .trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('désactive uniquement le limiteur du benchmark à horloge figée', () => {
    const run = fs.readFileSync(fileURLToPath(new URL('../run.mjs', import.meta.url)), 'utf8');
    expect(run).toContain("APP_ENV: 'test'");
    expect(run).toContain("RATE_LIMIT_MODE: 'off'");
  });

  it('refuse explicitement le benchmark INP supprimé', () => {
    const run = fs.readFileSync(fileURLToPath(new URL('../run.mjs', import.meta.url)), 'utf8');
    expect(run).toContain("new Set(['seed', 'lighthouse', 'k6'])");
    expect(run).not.toContain('function inp()');
  });
});
