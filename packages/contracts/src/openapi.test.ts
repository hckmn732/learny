import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildOpenApiDocument, serializeOpenApiDocument } from './openapi';
import { ROUTES } from './routes';

/** Reads an object the document must contain; a missing one fails the case explicitly. */
function entry(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    throw new Error('élément attendu absent du document OpenAPI');
  }
  return value as Record<string, unknown>;
}

/**
 * [SPEC-201] The OpenAPI 3.1 document built from the route registry (EF-8, ET-8).
 *
 * The exporter `packages/contracts/scripts/export-contract.ts` runs outside Vitest, so the builder
 * itself was never measured; these cases pin the shape it must produce for every kind of route.
 */
describe('[SPEC-201] buildOpenApiDocument', () => {
  const params = z.object({ id: z.uuid() });
  const query = z.object({ from: z.string(), limit: z.number().int().optional() });
  const body = z.object({ title: z.string().min(1) });
  const output = z.object({ id: z.uuid(), title: z.string() });

  const registry = {
    'demo.get': {
      id: 'demo.get',
      method: 'GET',
      path: '/api/v1/demo/:id',
      auth: 'user',
      params,
      query,
      output,
      successStatus: 200,
      summary: 'Lit une démonstration.',
      errors: ['NOT_FOUND'],
      rateLimit: 'default',
    },
    'demo.create': {
      id: 'demo.create',
      method: 'POST',
      path: '/api/v1/demo',
      auth: 'none',
      body,
      output,
      successStatus: 201,
      summary: 'Crée une démonstration.',
      errors: ['VALIDATION_FAILED'],
      idempotent: true,
      rateLimit: 'none',
    },
    'demo.redirect': {
      id: 'demo.redirect',
      method: 'GET',
      path: '/api/v1/demo/redirect',
      auth: 'none',
      output: null,
      successStatus: 302,
      summary: 'Redirige.',
      errors: [],
      rateLimit: 'none',
    },
    'demo.accepted': {
      id: 'demo.accepted',
      method: 'POST',
      path: '/api/v1/demo/accepted',
      auth: 'none',
      body,
      output: z.undefined(),
      successStatus: 202,
      summary: 'Accepte sans corps.',
      errors: [],
      rateLimit: 'none',
    },
  } as unknown as Parameters<typeof buildOpenApiDocument>[0];

  it('produit un document OpenAPI 3.1 déterministe', () => {
    const first = buildOpenApiDocument(registry, { version: '1.2.3' });
    const second = buildOpenApiDocument(registry, { version: '1.2.3' });
    expect(first).toEqual(second);
    expect(first.openapi).toBe('3.1.0');
    expect((first.info as { version: string }).version).toBe('1.2.3');
    expect(serializeOpenApiDocument(first)).toBe(`${JSON.stringify(first, null, 2)}\n`);
  });

  it('convertit les paramètres de route et déclare path et query', () => {
    const document = buildOpenApiDocument(registry, { version: '1' });
    const paths = document.paths as unknown as Record<string, Record<string, unknown>>;
    expect(Object.keys(paths)).toEqual([
      '/api/v1/demo',
      '/api/v1/demo/accepted',
      '/api/v1/demo/redirect',
      '/api/v1/demo/{id}',
    ]);
    const operation = entry(paths['/api/v1/demo/{id}']).get as {
      parameters: { name: string; in: string; required: boolean }[];
      security: unknown[];
    };
    expect(operation.parameters.map(({ name, in: location, required }) => [name, location, required])).toEqual([
      ['id', 'path', true],
      ['from', 'query', true],
      ['limit', 'query', false],
    ]);
    for (const parameter of operation.parameters) {
      expect(entry(entry(parameter).schema).type).toBeTypeOf('string');
    }
    expect(operation.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
  });

  it('ajoute la clé d’idempotence, les erreurs et le corps attendu', () => {
    const document = buildOpenApiDocument(registry, { version: '1' });
    const paths = document.paths as unknown as Record<string, Record<string, Record<string, unknown>>>;
    const create = entry(entry(paths['/api/v1/demo']).post);
    const parameters = create.parameters as { name: string; in: string; required: boolean }[];
    expect(parameters).toContainEqual({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,128}$' },
    });
    const requestBody = entry(create.requestBody);
    expect(requestBody.required).toBe(true);
    expect(Object.keys(entry(requestBody.content))).toEqual(['application/json']);
    const responses = create.responses as Record<string, unknown>;
    expect(Object.keys(responses).sort()).toEqual(['201', '400', '500']);
    expect(create.security).toBeUndefined();
  });

  it('décrit une redirection et une réponse sans corps', () => {
    const document = buildOpenApiDocument(registry, { version: '1' });
    const paths = document.paths as unknown as Record<string, Record<string, Record<string, unknown>>>;
    const redirect = entry(entry(paths['/api/v1/demo/redirect']).get);
    expect((redirect.responses as Record<string, unknown>)['302']).toMatchObject({
      description: 'Redirection',
      headers: { Location: { schema: { type: 'string' } } },
    });
    const accepted = entry(entry(paths['/api/v1/demo/accepted']).post);
    const acceptedResponse = entry(
      (accepted.responses as Record<string, Record<string, unknown>>)['202'],
    );
    expect(acceptedResponse.description).toBe('Succès');
    expect(acceptedResponse.content).toBeUndefined();
  });

  it('documente tout le registre réel, sans perdre d’opération', () => {
    const document = buildOpenApiDocument(ROUTES, { version: 'dev' });
    const paths = document.paths as unknown as Record<string, Record<string, unknown>>;
    const operations = Object.values(paths).reduce((total, item) => total + Object.keys(item).length, 0);
    expect(operations).toBe(Object.keys(ROUTES).length);
    const components = entry(document.components);
    expect(Object.keys(entry(components.schemas))).toContain('ProblemDetails');
    const securitySchemes = entry(components.securitySchemes);
    expect(securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    expect(securitySchemes.cookieAuth).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'sb-access-token',
    });
  });
});
