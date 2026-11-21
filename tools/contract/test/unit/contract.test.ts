// [SPEC-2002] Contract export and OpenAPI compatibility checker.
import fs from 'node:fs';
import path from 'node:path';

import { validate } from '@readme/openapi-parser';
import { describe, expect, it } from 'vitest';

import {
  applyExceptions,
  compareDocuments,
  loadDocument,
  validateExceptions,
} from '../../compat.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const OPENAPI = path.join(ROOT, 'api', 'openapi.yaml');
const SERVED = path.join(ROOT, 'apps', 'api', 'openapi.json');

function operation(path: string, method = 'get'): Record<string, unknown> {
  return {
    operationId: 'demo.get',
    summary: 'DÃ©mo',
    responses: {
      '200': {
        description: 'SuccÃ¨s',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    },
    [method]: undefined,
  };
}

function documentWith(
  operations: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  return { openapi: '3.1.0', paths: operations, components: { schemas: {} } };
}

describe('[SPEC-2002] compatibility checker', () => {
  it('accepts two identical documents', () => {
    const document = documentWith({ '/api/v1/demo': { get: operation('/api/v1/demo') } });
    const { breaking, nonBreaking } = compareDocuments(document, document);
    expect(breaking).toEqual([]);
    expect(nonBreaking).toEqual([]);
  });

  it('detects a removed operation and a changed response schema (CA-3)', () => {
    const base = documentWith({ '/api/v1/demo': { get: operation('/api/v1/demo') } });
    const removed = documentWith({});
    expect(
      compareDocuments(base, removed).breaking.map((diff: { kind: string }) => diff.kind),
    ).toEqual(['operation-removed']);

    const changed = documentWith({
      '/api/v1/demo': {
        get: {
          operationId: 'demo.get',
          summary: 'DÃ©mo',
          responses: {
            '200': {
              description: 'SuccÃ¨s',
              content: { 'application/json': { schema: { type: 'string' } } },
            },
          },
        },
      },
    });
    expect(
      compareDocuments(base, changed).breaking.map((diff: { kind: string }) => diff.kind),
    ).toEqual(['response-changed']);
  });

  it('classifies an added operation as non-breaking', () => {
    const base = documentWith({});
    const target = documentWith({ '/api/v1/new': { get: operation('/api/v1/new') } });
    const { breaking, nonBreaking } = compareDocuments(base, target);
    expect(breaking).toEqual([]);
    expect(nonBreaking.map((diff: { kind: string }) => diff.kind)).toEqual(['operation-added']);
  });

  it('accepts a breaking difference listed with an ADR and rejects one without (CL-3)', () => {
    const breaking = [{ kind: 'operation-removed', operation: 'GET /api/v1/demo' }];
    const accepted = applyExceptions(breaking, [
      {
        operation: 'GET /api/v1/demo',
        kind: 'operation-removed',
        adr: 'ADR-2012',
        reason: 'retrait',
      },
    ]);
    expect(accepted.accepted).toHaveLength(1);
    expect(accepted.unexplained).toEqual([]);

    const rejected = applyExceptions(breaking, [
      { operation: 'GET /api/v1/demo', kind: 'operation-removed', reason: 'sans ADR' },
    ]);
    expect(rejected.unexplained).toHaveLength(1);
    expect(
      validateExceptions([{ operation: 'GET /api/v1/demo', kind: 'x', reason: 'y' }]),
    ).not.toEqual([]);
    expect(
      validateExceptions([
        { operation: 'GET /api/v1/demo', kind: 'x', adr: 'ADR-2012', reason: 'y' },
      ]),
    ).toEqual([]);
  });
});

describe('[SPEC-2002] exported contract', () => {
  it('is a valid OpenAPI 3.1 document (CA-1)', async () => {
    const result = await validate(OPENAPI);
    expect(result.valid).toBe(true);
  });

  it('describes the 217 operations with the x-learny policy and named schemas (CA-1)', () => {
    const document = loadDocument(OPENAPI) as {
      paths: Record<string, Record<string, { 'x-learny'?: { id: string } }>>;
      components: { schemas: Record<string, unknown> };
    };
    let operations = 0;
    let withPolicy = 0;
    for (const item of Object.values(document.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const operation = item[method];
        if (operation === undefined) continue;
        operations += 1;
        if (operation['x-learny']?.id !== undefined) withPolicy += 1;
      }
    }
    expect(operations).toBe(217);
    expect(withPolicy).toBe(217);
    for (const name of ['AgendaGetOutput', 'AgendaGetQuery', 'AuthSignInBody']) {
      expect(document.components.schemas[name], name).toBeDefined();
    }
  });

  it('reports no semantic difference between the source YAML and the served JSON (CL-2)', () => {
    const { breaking, nonBreaking } = compareDocuments(loadDocument(OPENAPI), loadDocument(SERVED));
    expect(breaking).toEqual([]);
    expect(nonBreaking).toEqual([]);
  });

  it('ships an empty exception list with no drift (CL-3)', () => {
    const exceptions = fs.readFileSync(path.join(ROOT, 'api', 'contract-exceptions.yaml'), 'utf8');
    expect(exceptions.trim()).toBe('[]');
  });
});
