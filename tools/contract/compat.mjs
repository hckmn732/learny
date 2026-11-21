// SPEC-2002 — OpenAPI compatibility checker (EF-4, ADR-2012).
//
// Compares two OpenAPI documents operation by operation and classifies every difference as
// breaking or non-breaking. A breaking difference is only accepted when `api/contract-exceptions.yaml`
// lists it *with an ADR* (CL-3): an exception without a valid `ADR-2xxx` reference fails the run.
//
//   node tools/contract/compat.mjs --base api/openapi.yaml --target apps/api/openapi.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import YAML from 'yaml';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROOT = process.env.CONTRACT_ROOT ? path.resolve(process.env.CONTRACT_ROOT) : REPO_ROOT;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const ADR_PATTERN = /^ADR-\d{4}$/;

/** Reads a JSON or YAML OpenAPI document. */
export function loadDocument(file) {
  const text = fs.readFileSync(file, 'utf8');
  return file.endsWith('.json') ? JSON.parse(text) : YAML.parse(text);
}

/** Replaces every `$ref` by its target so two documents compare on semantics, not on layout. */
export function resolveRefs(value, document, seen = new Set()) {
  if (Array.isArray(value)) return value.map((item) => resolveRefs(item, document, seen));
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.$ref === 'string') {
    const match = /^#\/components\/schemas\/(.+)$/.exec(value.$ref);
    if (match === null) return value;
    const name = decodeURIComponent(match[1]);
    if (seen.has(name)) return { $circular: name };
    const target = document.components?.schemas?.[name];
    if (target === undefined) return { $missing: name };
    return resolveRefs(target, document, new Set([...seen, name]));
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'x-learny') continue;
    out[key] = resolveRefs(item, document, seen);
  }
  return out;
}

/** `METHOD /path` -> comparable operation object. */
export function operations(document) {
  const out = new Map();
  for (const [routePath, item] of Object.entries(document.paths ?? {})) {
    if (item === null || typeof item !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (operation === undefined) continue;
      out.set(`${method.toUpperCase()} ${routePath}`, resolveRefs(operation, document));
    }
  }
  return out;
}

function stable(value) {
  return JSON.stringify(value ?? null);
}

function successKey(operation) {
  return Object.keys(operation.responses ?? {})
    .filter((status) => /^2|^3/.test(status))
    .sort()[0];
}

function errorKeys(operation) {
  return Object.keys(operation.responses ?? {})
    .filter((status) => /^4|^5/.test(status))
    .sort();
}

function parametersByKey(operation) {
  const map = new Map();
  for (const parameter of operation.parameters ?? []) {
    map.set(`${parameter.in}:${parameter.name}`, parameter);
  }
  return map;
}

function bodySchema(operation) {
  return operation.requestBody?.content?.['application/json']?.schema ?? null;
}

function responseSchema(operation) {
  const key = successKey(operation);
  if (key === undefined) return null;
  return operation.responses[key]?.content?.['application/json']?.schema ?? null;
}

/**
 * Compares two operations. Returns `{breaking, nonBreaking}` lists of `{kind, detail}`.
 */
export function compareOperation(key, base, target) {
  const breaking = [];
  const nonBreaking = [];
  if (target === undefined) {
    return { breaking: [{ kind: 'operation-removed', operation: key }], nonBreaking };
  }
  if (stable(bodySchema(base)) !== stable(bodySchema(target))) {
    breaking.push({ kind: 'request-body-changed', operation: key });
  }
  if (stable(responseSchema(base)) !== stable(responseSchema(target))) {
    breaking.push({ kind: 'response-changed', operation: key });
  }
  if (successKey(base) !== successKey(target)) {
    breaking.push({ kind: 'success-status-changed', operation: key });
  }
  const baseParameters = parametersByKey(base);
  const targetParameters = parametersByKey(target);
  for (const [parameterKey, parameter] of baseParameters) {
    const other = targetParameters.get(parameterKey);
    if (other === undefined) {
      breaking.push({ kind: 'parameter-removed', operation: key, detail: parameterKey });
    } else if (
      stable(parameter.schema) !== stable(other.schema) ||
      parameter.required !== other.required
    ) {
      breaking.push({ kind: 'parameter-changed', operation: key, detail: parameterKey });
    }
  }
  for (const parameterKey of targetParameters.keys()) {
    if (!baseParameters.has(parameterKey)) {
      nonBreaking.push({ kind: 'parameter-added', operation: key, detail: parameterKey });
    }
  }
  if (stable(base.security) !== stable(target.security)) {
    breaking.push({ kind: 'security-changed', operation: key });
  }
  const baseErrors = new Set(errorKeys(base));
  const targetErrors = new Set(errorKeys(target));
  for (const status of baseErrors) {
    if (!targetErrors.has(status))
      breaking.push({ kind: 'error-status-removed', operation: key, detail: status });
  }
  for (const status of targetErrors) {
    if (!baseErrors.has(status))
      nonBreaking.push({ kind: 'error-status-added', operation: key, detail: status });
  }
  return { breaking, nonBreaking };
}

/** Full document comparison; operations added in the target are non-breaking. */
export function compareDocuments(baseDocument, targetDocument) {
  const base = operations(baseDocument);
  const target = operations(targetDocument);
  const breaking = [];
  const nonBreaking = [];
  for (const [key, operation] of base) {
    const result = compareOperation(key, operation, target.get(key));
    breaking.push(...result.breaking);
    nonBreaking.push(...result.nonBreaking);
  }
  for (const key of target.keys()) {
    if (!base.has(key)) nonBreaking.push({ kind: 'operation-added', operation: key });
  }
  return { breaking, nonBreaking };
}

/** Reads `api/contract-exceptions.yaml` (a list of `{operation, kind, adr, reason}`). */
export function loadExceptions(file = path.join(ROOT, 'api', 'contract-exceptions.yaml')) {
  if (!fs.existsSync(file)) return [];
  const parsed = YAML.parse(fs.readFileSync(file, 'utf8'));
  if (parsed === null || parsed === undefined) return [];
  if (!Array.isArray(parsed)) throw new Error('contract-exceptions.yaml doit être une liste');
  return parsed;
}

/** An exception is only valid with an ADR reference (CL-3). */
export function validateExceptions(exceptions) {
  const problems = [];
  for (const [index, exception] of exceptions.entries()) {
    if (typeof exception?.operation !== 'string' || typeof exception?.kind !== 'string') {
      problems.push(`exception ${String(index)} : operation et kind sont obligatoires`);
    }
    if (typeof exception?.adr !== 'string' || !ADR_PATTERN.test(exception.adr)) {
      problems.push(
        `exception ${String(index)} (${String(exception?.operation)}) : ADR-xxxx obligatoire`,
      );
    }
    if (typeof exception?.reason !== 'string' || exception.reason.trim() === '') {
      problems.push(`exception ${String(index)} : reason obligatoire`);
    }
  }
  return problems;
}

/** Splits the divergences into accepted (listed *with* an ADR) and unexplained ones (CL-3). */
export function applyExceptions(breaking, exceptions) {
  const accepted = [];
  const unexplained = [];
  for (const diff of breaking) {
    const match = exceptions.find(
      (exception) =>
        exception.operation === diff.operation &&
        exception.kind === diff.kind &&
        typeof exception.adr === 'string' &&
        ADR_PATTERN.test(exception.adr),
    );
    if (match === undefined) unexplained.push(diff);
    else accepted.push({ ...diff, adr: match.adr });
  }
  return { accepted, unexplained };
}

export function main(argv = process.argv.slice(2), root = ROOT) {
  const valueOf = (flag, fallback) => {
    const index = argv.indexOf(flag);
    return index === -1 ? fallback : argv[index + 1];
  };
  const baseFile = valueOf('--base', path.join(root, 'api', 'openapi.yaml'));
  const targetFile = valueOf('--target', path.join(root, 'apps', 'api', 'openapi.json'));
  const exceptionsFile = valueOf(
    '--exceptions',
    path.join(root, 'api', 'contract-exceptions.yaml'),
  );

  const exceptions = loadExceptions(exceptionsFile);
  const problems = validateExceptions(exceptions);
  if (problems.length > 0) {
    console.error('Exceptions de contrat invalides :');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }

  const base = loadDocument(baseFile);
  const target = loadDocument(targetFile);
  const { breaking, nonBreaking } = compareDocuments(base, target);
  const { accepted, unexplained } = applyExceptions(breaking, exceptions);

  console.log(`Comparaison ${path.basename(baseFile)} -> ${path.basename(targetFile)}`);
  console.log(`  ruptures : ${String(breaking.length)} (acceptées : ${String(accepted.length)})`);
  console.log(`  ajouts   : ${String(nonBreaking.length)}`);
  for (const diff of accepted)
    console.log(`  ✔ acceptée (${diff.adr}) : ${diff.kind} ${diff.operation}`);
  if (unexplained.length > 0) {
    console.error('Ruptures non expliquées :');
    for (const diff of unexplained)
      console.error(`  ✖ ${diff.kind} ${diff.operation}${diff.detail ? ` (${diff.detail})` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log('✔ compatibilité vérifiée');
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;
if (entry !== null && fileURLToPath(entry) === fileURLToPath(import.meta.url)) main();
