import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineRoute } from './define-route';
import { buildOpenApiDocument, serializeOpenApiDocument } from './openapi';
import { ROUTES } from './routes';

const VERSION = '1.2.3';

type Operation = Record<string, unknown>;

function operationOf(document: Record<string, unknown>, path: string, method: string): Operation {
  const paths = document.paths as Record<string, Record<string, Operation> | undefined>;
  const operation = paths[path]?.[method];
  if (operation === undefined) throw new Error(`opération ${method} ${path} absente`);
  return operation;
}

describe('[SPEC-201] document OpenAPI', () => {
  it('reproduit apps/web/public/openapi.json à partir du registre (ET-8)', () => {
    const { version } = JSON.parse(
      readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'),
    ) as { version: string };
    const committed = readFileSync(
      resolve(__dirname, '../../../apps/web/public/openapi.json'),
      'utf8',
    );
    const built = serializeOpenApiDocument(buildOpenApiDocument(ROUTES, { version }));
    expect(built).toBe(committed);
  });

  it('est déterministe : deux constructions donnent le même texte', () => {
    const a = serializeOpenApiDocument(buildOpenApiDocument(ROUTES, { version: VERSION }));
    const b = serializeOpenApiDocument(buildOpenApiDocument(ROUTES, { version: VERSION }));
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
  });

  it('trie les clés, convertit :param en {param} et documente les erreurs du catalogue', () => {
    const route = defineRoute({
      id: 'test.get',
      method: 'GET',
      path: '/api/v1/things/:tid',
      summary: 'Lit une chose',
      auth: 'user',
      rateLimit: 'default',
      params: z.object({ tid: z.uuid() }),
      query: z.object({ cursor: z.string().optional(), limit: z.number().int() }),
      output: z.object({ id: z.string() }),
      successStatus: 200,
      errors: ['NOT_FOUND'],
    });
    const document = buildOpenApiDocument({ route }, { version: VERSION });
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document)).toEqual([...Object.keys(document)].sort());
    const op = operationOf(document, '/api/v1/things/{tid}', 'get');
    expect(op.operationId).toBe('test.get');
    const parameters = op.parameters as Array<Record<string, unknown>>;
    expect(parameters.map((p) => [p.name, p.in, p.required])).toEqual([
      ['tid', 'path', true],
      ['cursor', 'query', false],
      ['limit', 'query', true],
    ]);
    const responses = op.responses as Record<
      string,
      { content?: Record<string, { schema: Record<string, unknown> }> }
    >;
    expect(Object.keys(responses)).toEqual(['200', '400', '401', '404', '429', '500']);
    expect(op.security).toEqual([{ cookieAuth: [] }]);
    const schema = responses['200']?.content?.['application/json']?.schema;
    expect(schema).toBeDefined();
    expect(schema?.$schema).toBeUndefined();
  });

  it('documente la clé d’idempotence, le corps et un succès 202 sans contenu', () => {
    const route = defineRoute({
      id: 'test.create',
      method: 'POST',
      path: '/api/v1/things',
      summary: 'Crée une chose',
      auth: 'user',
      rateLimit: 'default',
      idempotent: true,
      body: z.object({ title: z.string() }),
      output: z.undefined(),
      successStatus: 202,
      errors: [],
    });
    const document = buildOpenApiDocument({ route }, { version: VERSION });
    const op = operationOf(document, '/api/v1/things', 'post');
    const parameters = op.parameters as Array<Record<string, unknown>>;
    expect(parameters).toEqual([
      expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
    ]);
    expect(op.requestBody).toMatchObject({ required: true });
    const responses = op.responses as Record<string, Record<string, unknown>>;
    expect(responses['202']).toEqual({ description: 'Succès' });
    expect(Object.keys(responses)).toEqual(['202', '400', '401', '429', '500']);
  });

  it('documente une redirection publique sans limite de débit', () => {
    const route = defineRoute({
      id: 'test.redirect',
      method: 'GET',
      path: '/api/v1/go',
      summary: 'Redirige',
      auth: 'public',
      rateLimit: 'none',
      output: null,
      successStatus: 302,
      errors: [],
    });
    const document = buildOpenApiDocument({ route }, { version: VERSION });
    const op = operationOf(document, '/api/v1/go', 'get');
    expect(op.parameters).toBeUndefined();
    expect(op.security).toBeUndefined();
    const responses = op.responses as Record<string, Record<string, unknown>>;
    expect(responses['302']).toEqual({
      description: 'Redirection',
      headers: { Location: { schema: { type: 'string' } } },
    });
    expect(Object.keys(responses)).toEqual(['302', '500']);
  });
});
