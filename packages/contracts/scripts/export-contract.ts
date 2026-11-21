// SPEC-2002 â€” exports the single source of truth of the HTTP contract (ADR-2004, ADR-2012).
//
// Writes, from the live Zod registry:
//   - `api/openapi.yaml`      OpenAPI 3.1 with `x-learny` policy per operation and named component
//                             schemas (`<RouteIdPascal>Params|Query|Body|Output`);
//   - `api/errors.json`       error catalog (`code -> {status, title, type}`);
//   - `api/events.schema.json` the 49 outbox event payloads.
//
// `--check` regenerates in memory and exits 1 on any drift (EF-3, CL-2).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { stringify } from 'yaml';
import { z } from 'zod';

import { ERROR_CATALOG, PROBLEM_TYPE_BASE, errorCodeToKebab } from '@learny/core';

import type { AnyRoute } from '../src/define-route';
import { EVENTS, ROUTES, buildOpenApiDocument } from '../src/index';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version?: string;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

/** Deterministic order: same registry always produces the same bytes (ET-1). */
function sortKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const sorted: JsonObject = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortKeys(value[key] as Json);
    return sorted;
  }
  return value;
}

/** `attempts.submit` -> `AttemptsSubmit`; `dev.sdd.spec-103.demo` -> `DevSddSpec103Demo`. */
export function pascalName(routeId: string): string {
  return routeId
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part !== '')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
}

function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function isJsonObject(value: Json | undefined): value is JsonObject {
  return (
    value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
  );
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

/** The `x-learny` policy object of an operation (00-conventions Â§6). */
export function learnyExtension(route: AnyRoute): JsonObject {
  return {
    id: route.id,
    auth: route.auth,
    rateLimit: route.rateLimit ?? 'default',
    idempotent: route.idempotent === true,
    requiresIdempotencyKey: route.requiresIdempotencyKey === true,
    freshAuth: route.freshAuth === true,
    legalAcceptance: route.legalAcceptance === true,
    validationStatus: route.validationStatus ?? 400,
    successStatus: route.successStatus,
  };
}

function objectFromParameters(parameters: Json[]): JsonObject | undefined {
  if (parameters.length === 0) return undefined;
  const properties: JsonObject = {};
  const required: Json[] = [];
  for (const parameter of parameters) {
    const entry = parameter as JsonObject;
    const name = entry.name;
    if (typeof name !== 'string') continue;
    properties[name] = entry.schema as Json;
    if (entry.required === true) required.push(name);
  }
  return { type: 'object', properties, ...(required.length === 0 ? {} : { required }) };
}

/**
 * Adds the named component schemas and the `x-learny` policy to the freshly built document.
 * Schemas stay byte-identical: they are moved from the operation into `components.schemas` and
 * referenced with `$ref`, which gives readable Python model names without changing validation.
 */
export function enrichDocument(document: JsonObject, routes: Record<string, AnyRoute>): JsonObject {
  const enriched = structuredClone(document);
  const components = (enriched.components ?? {}) as JsonObject;
  const schemas = (components.schemas ?? {}) as JsonObject;

  for (const route of Object.values(routes)) {
    const pathItem = ((enriched.paths ?? {}) as JsonObject)[openApiPath(route.path)] as
      JsonObject | undefined;
    const operation = pathItem?.[route.method.toLowerCase()] as JsonObject | undefined;
    if (operation === undefined) continue;

    const base = pascalName(route.id);
    operation['x-learny'] = learnyExtension(route);

    const parameters = (operation.parameters ?? []) as Json[];
    const namedObject = objectFromParameters(parameters);
    if (namedObject !== undefined) {
      const queryParameters = parameters.filter(
        (parameter) => (parameter as JsonObject).in === 'query',
      );
      const pathParameters = parameters.filter(
        (parameter) => (parameter as JsonObject).in === 'path',
      );
      if (pathParameters.length > 0) {
        schemas[`${base}Params`] = objectFromParameters(pathParameters) as Json;
      }
      if (queryParameters.length > 0) {
        schemas[`${base}Query`] = objectFromParameters(queryParameters) as Json;
      }
    }

    const body = (operation.requestBody as JsonObject | undefined)?.content as
      JsonObject | undefined;
    const bodySchema = (body?.['application/json'] as JsonObject | undefined)?.schema;
    if (bodySchema !== undefined) {
      schemas[`${base}Body`] = bodySchema;
      (body?.['application/json'] as JsonObject).schema = {
        $ref: `#/components/schemas/${base}Body`,
      };
    }

    const success = operation.responses as JsonObject | undefined;
    const successContent = (success?.[String(route.successStatus)] as JsonObject | undefined)
      ?.content as JsonObject | undefined;
    const outputSchema = (successContent?.['application/json'] as JsonObject | undefined)?.schema;
    if (isJsonObject(outputSchema) && outputSchema.$ref === undefined) {
      schemas[`${base}Output`] = outputSchema;
      (successContent?.['application/json'] as JsonObject).schema = {
        $ref: `#/components/schemas/${base}Output`,
      };
    }
  }

  components.schemas = schemas;
  enriched.components = components;
  return sortKeys(enriched) as JsonObject;
}

/** Error catalog with the problem `type` the API actually returns (`toProblem`). */
export function errorCatalog(): JsonObject {
  const out: JsonObject = {};
  for (const code of Object.keys(ERROR_CATALOG).sort()) {
    const entry = ERROR_CATALOG[code as keyof typeof ERROR_CATALOG];
    out[code] = {
      status: entry.status,
      title: entry.title,
      type: `${PROBLEM_TYPE_BASE}${errorCodeToKebab(code)}`,
    };
  }
  return out;
}

/** The 49 event payload schemas, in the same order as the registry. */
export function eventSchemas(): JsonObject {
  const schemas: JsonObject = {};
  for (const name of Object.keys(EVENTS).sort()) {
    schemas[name] = jsonSchema(EVENTS[name as keyof typeof EVENTS], 'input');
  }
  return schemas;
}

export function buildArtefacts(): {
  openapi: string;
  errors: string;
  events: string;
} {
  const document = buildOpenApiDocument(ROUTES, { version: version ?? '0.0.0' });
  const enriched = enrichDocument(document, ROUTES as Record<string, AnyRoute>);
  return {
    openapi: stringify(enriched, { lineWidth: 0, sortMapEntries: false }),
    errors: `${JSON.stringify(errorCatalog(), null, 2)}\n`,
    events: `${JSON.stringify(eventSchemas(), null, 2)}\n`,
  };
}

const TARGETS = {
  openapi: resolve(root, 'api/openapi.yaml'),
  errors: resolve(root, 'api/errors.json'),
  events: resolve(root, 'api/events.schema.json'),
} as const;

function main(): void {
  const check = process.argv.includes('--check');
  const artefacts = buildArtefacts();
  let drift = false;
  for (const key of ['openapi', 'errors', 'events'] as const) {
    const file = TARGETS[key];
    const content = artefacts[key];
    if (check) {
      let current = '';
      try {
        current = readFileSync(file, 'utf8');
      } catch {
        current = '';
      }
      if (current !== content) {
        console.error(`âœ– ${file} est pÃ©rimÃ© : lancer pnpm contract:export`);
        drift = true;
      }
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    console.log(`âœ” ${file}`);
  }
  if (check) {
    if (drift) process.exit(1);
    console.log('âœ” contrat Ã  jour');
  }
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;
if (entry !== null && fileURLToPath(entry) === fileURLToPath(import.meta.url)) main();
