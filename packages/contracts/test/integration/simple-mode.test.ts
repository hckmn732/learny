// [SPEC-4001] Contract of simple mode: the eight operations, their policy and the error catalogue.
//
// The test reads the live registry and the generated artefacts (`api/openapi.yaml`,
// `api/errors.json`, `api/events.schema.json`), so a drift between the sources and the published
// contract fails here (ET-1, ET-2).
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EVENTS } from '../../src/events';
import { ROUTES } from '../../src/routes';

const ROOT = path.resolve(import.meta.dirname, '../../../..');

const EXPECTED = [
  ['formations.simple.create', 'POST', '/api/v1/formations/simple', 201],
  ['formations.simple.get', 'GET', '/api/v1/formations/:fid/simple', 200],
  ['formations.simple.analysis', 'POST', '/api/v1/formations/:fid/simple/analysis', 202],
  ['sources.uploads.create', 'POST', '/api/v1/formations/:fid/sources/uploads', 201],
  ['sources.links.create', 'POST', '/api/v1/formations/:fid/sources/links', 201],
  ['resources.role', 'PATCH', '/api/v1/resources/:rid/role', 200],
  ['diagnostic.create', 'POST', '/api/v1/formations/:fid/diagnostic', 201],
  ['diagnostic.skip', 'POST', '/api/v1/formations/:fid/diagnostic/skip', 204],
] as const;

const ERROR_CODES = [
  'AI_NOT_CONFIGURED',
  'SIMPLE_NO_COURSE_SOURCE',
  'SIMPLE_TOO_MANY_SOURCES',
  'SIMPLE_ANALYSIS_LOCKED',
  'SIMPLE_NOT_SIMPLE',
  'DIAGNOSTIC_ALREADY_DONE',
  'DIAGNOSTIC_NO_CHECK',
] as const;

describe('[SPEC-4001] contrat du mode simple', () => {
  it('[SPEC-4001] déclare les huit opérations avec leur méthode, leur chemin et leur statut', () => {
    for (const [id, method, routePath, status] of EXPECTED) {
      const route = Object.values(ROUTES).find((candidate) => candidate.id === id);
      expect(route, id).toBeDefined();
      expect(route.method, id).toBe(method);
      expect(route.path, id).toBe(routePath);
      expect(route.successStatus, id).toBe(status);
      expect(route.auth, id).toBe('user');
    }
  });

  it('[SPEC-4001] publie les opérations dans le document OpenAPI', () => {
    const document: string = readFileSync(path.join(ROOT, 'api/openapi.yaml'), 'utf8');
    for (const [id] of EXPECTED) expect(document, id).toContain(`id: ${id}`);
    for (const [, , routePath] of EXPECTED) {
      expect(document, routePath).toContain(routePath.replace(/:([a-z]+)/gu, '{$1}'));
    }
  });

  it('[SPEC-4001] publie les codes d’erreur du mode simple dans le catalogue', () => {
    const errors = JSON.parse(readFileSync(path.join(ROOT, 'api/errors.json'), 'utf8')) as Record<
      string,
      { status: number }
    >;
    const expectedStatus: Record<string, number> = {
      AI_NOT_CONFIGURED: 409,
      SIMPLE_NO_COURSE_SOURCE: 422,
      SIMPLE_TOO_MANY_SOURCES: 422,
      SIMPLE_ANALYSIS_LOCKED: 409,
      SIMPLE_NOT_SIMPLE: 409,
      DIAGNOSTIC_ALREADY_DONE: 409,
      DIAGNOSTIC_NO_CHECK: 409,
    };
    for (const code of ERROR_CODES) {
      expect(errors[code], code).toBeDefined();
      expect(errors[code]?.status, code).toBe(expectedStatus[code]);
    }
  });

  it('[SPEC-4001] publie les deux événements du mode simple', () => {
    expect(Object.keys(EVENTS)).toEqual(
      expect.arrayContaining(['simple.analysis.requested', 'simple.generation.requested']),
    );
    const schema = JSON.parse(
      readFileSync(path.join(ROOT, 'api/events.schema.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(Object.keys(schema)).toEqual(
      expect.arrayContaining(['simple.analysis.requested', 'simple.generation.requested']),
    );
  });
});
