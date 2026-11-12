import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validate } from '@readme/openapi-parser';
import { describe, expect, it } from 'vitest';

import { ROUTES, buildOpenApiDocument, serializeOpenApiDocument } from '../../src/index';

const root = resolve(import.meta.dirname, '../../../..');
const committed = readFileSync(resolve(root, 'apps/web/public/openapi.json'), 'utf8');
const version = (
  JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }
).version;

describe('[SPEC-201] openapi', () => {
  it('matches the committed apps/web/public/openapi.json (CA-6)', () => {
    const generated = serializeOpenApiDocument(buildOpenApiDocument(ROUTES, { version }));
    expect(generated).toBe(committed);
  });

  it('is a valid OpenAPI 3.1 document (CA-6)', async () => {
    const result = await validate(JSON.parse(committed) as never);
    expect(result.valid, JSON.stringify(result)).toBe(true);
    expect((JSON.parse(committed) as { openapi: string }).openapi).toBe('3.1.0');
  });

  it('documents every route of the registry with its method, path parameters and security', () => {
    const document = JSON.parse(committed) as {
      paths: Record<string, Record<string, { operationId: string; security?: unknown[] }>>;
    };
    for (const route of Object.values(ROUTES)) {
      const path = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      const operation = document.paths[path]?.[route.method.toLowerCase()];
      expect(operation?.operationId, route.id).toBe(route.id);
      expect(operation?.security !== undefined, route.id).toBe(route.auth === 'user');
    }
  });

  it('describes errors as problem+json and the idempotency header', () => {
    const document = JSON.parse(committed) as {
      paths: Record<
        string,
        Record<
          string,
          {
            parameters?: { name: string }[];
            responses: Record<string, { content: Record<string, unknown> }>;
          }
        >
      >;
    };
    const echo = document.paths['/api/v1/dev/sdd/echo']?.post;
    expect(echo?.parameters?.map((parameter) => parameter.name)).toContain('Idempotency-Key');
    expect(echo?.responses['400']?.content['application/problem+json']).toBeDefined();
    expect(echo?.responses['201']?.content['application/json']).toBeDefined();
  });

  it('is deterministic', () => {
    const first = serializeOpenApiDocument(buildOpenApiDocument(ROUTES, { version }));
    const second = serializeOpenApiDocument(buildOpenApiDocument(ROUTES, { version }));
    expect(second).toBe(first);
  });
});
