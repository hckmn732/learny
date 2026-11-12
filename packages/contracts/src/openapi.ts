import { z } from 'zod';

import { ERROR_CATALOG } from '@learny/core';

import { ProblemDetails } from './common';
import type { AnyRoute } from './define-route';

// OpenAPI 3.1 document built from the route registry (SPEC-201 EF-8, ET-8). Zod 4 emits JSON
// Schema 2020-12, which OpenAPI 3.1 adopts as is: no 3.0 normalisation is needed (ADR-0251).
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export interface OpenApiOptions {
  version: string;
}

function sortKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const sorted: JsonObject = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortKeys(value[key] as Json);
    return sorted;
  }
  return value;
}

function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonObject {
  const generated = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
  }) as JsonObject;
  const rest = { ...generated };
  delete rest.$schema;
  return rest;
}

function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function parametersOf(schema: z.ZodType | undefined, location: 'path' | 'query'): Json[] {
  if (schema === undefined) return [];
  const object = jsonSchema(schema, 'input');
  const properties = (object.properties ?? {}) as JsonObject;
  const required = new Set((object.required ?? []) as string[]);
  return Object.keys(properties)
    .sort()
    .map((name) => ({
      name,
      in: location,
      required: location === 'path' ? true : required.has(name),
      schema: properties[name] as Json,
    }));
}

const PROBLEM_REF = { $ref: '#/components/schemas/ProblemDetails' };

function errorResponses(route: AnyRoute): JsonObject {
  const statuses = new Set<number>([500]);
  if (route.params !== undefined || route.query !== undefined || route.body !== undefined) {
    statuses.add(400);
  }
  if (route.auth === 'user') statuses.add(401);
  if (route.rateLimit !== 'none') statuses.add(429);
  for (const code of route.errors) statuses.add(ERROR_CATALOG[code].status);
  const responses: JsonObject = {};
  for (const status of [...statuses].sort((a, b) => a - b)) {
    responses[String(status)] = {
      description: 'Erreur (RFC 9457)',
      content: { 'application/problem+json': { schema: PROBLEM_REF } },
    };
  }
  return responses;
}

function operation(route: AnyRoute): JsonObject {
  const parameters: Json[] = [
    ...parametersOf(route.params as z.ZodType | undefined, 'path'),
    ...parametersOf(route.query as z.ZodType | undefined, 'query'),
  ];
  if (route.idempotent === true) {
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,128}$' },
    });
  }
  const success: JsonObject = { description: 'Succès' };
  if (route.output !== null) {
    success.content = {
      'application/json': { schema: jsonSchema(route.output as z.ZodType, 'output') },
    };
  }
  const op: JsonObject = {
    operationId: route.id,
    summary: route.summary,
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(route.body === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: jsonSchema(route.body as z.ZodType, 'input') },
            },
          },
        }),
    responses: { [String(route.successStatus)]: success, ...errorResponses(route) },
    ...(route.auth === 'user' ? { security: [{ cookieAuth: [] }] } : {}),
  };
  return op;
}

/** Deterministic document: sorted keys, same output for the same registry. */
export function buildOpenApiDocument(
  routes: Record<string, AnyRoute>,
  options: OpenApiOptions,
): JsonObject {
  const paths: JsonObject = {};
  for (const route of Object.values(routes)) {
    const key = openApiPath(route.path);
    const item = (paths[key] ?? {}) as JsonObject;
    item[route.method.toLowerCase()] = operation(route);
    paths[key] = item;
  }
  const document: JsonObject = {
    openapi: '3.1.0',
    info: { title: 'Learny API', version: options.version },
    servers: [{ url: '/' }],
    paths,
    components: {
      schemas: { ProblemDetails: jsonSchema(ProblemDetails, 'output') },
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sb-access-token' },
      },
    },
  };
  return sortKeys(document) as JsonObject;
}

export function serializeOpenApiDocument(document: JsonObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
