// SPEC-2302 — final inventory of the Python backend (ADR-2006, ADR-2008, ADR-2012).
//
// The TypeScript backend is gone: this extractor reads the *contract artefact* and the *Python
// sources*, never a TypeScript registry. It proves CA-3 and EF-4 of SPEC-2302:
//
//   - every operation of `api/openapi.yaml` has a Python handler (`@handler("<id>")` of
//     `apps/api-py/src/learny_api/handlers/*`) or is installed by the special registry of
//     `apps/api-py/src/learny_api/special/*` (routes outside the generic pipeline);
//   - every event consumer comes from `learny_worker/consumers.py` and every cron tick from
//     `learny_worker/scheduler.py`, i.e. the Python worker;
//   - no TypeScript backend package nor app subsists in the tree.
//
// `api/inventory.json` stays the committed artefact: `apps/api-py/tests/unit/test_route_coverage.py`
// compares it to the installed routes, `packages/api-sdk/src/schema.test.ts` to the generated SDK and
// `tools/parity/run.ts` to its scenario paths.
//
//   node tools/migration/inventory.mjs            write `api/inventory.json` and the report
//   node tools/migration/inventory.mjs --check    exit 1 when the committed artefacts drift
//   node tools/migration/inventory.mjs --runtime  print the coverage verdict, write nothing
//
// `MIGRATION_ROOT` overrides the repository root (unit tests, fixture trees).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parse as parseYaml } from 'yaml';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ROOT = process.env.MIGRATION_ROOT
  ? path.resolve(process.env.MIGRATION_ROOT)
  : REPO_ROOT;

/** Contract artefacts and Python sources this inventory is built from. */
export const CONTRACT_FILE = 'api/openapi.yaml';
export const EVENTS_FILE = 'api/events.schema.json';
export const HANDLERS_DIR = 'apps/api-py/src/learny_api/handlers';
export const SPECIAL_DIR = 'apps/api-py/src/learny_api/special';
export const CONSUMERS_FILE = 'apps/worker-py/src/learny_worker/consumers.py';
export const SCHEDULER_FILE = 'apps/worker-py/src/learny_worker/scheduler.py';
export const TEST_DIRS = ['packages-py', 'apps/api-py', 'apps/worker-py'];
export const INVENTORY_JSON = 'api/inventory.json';
export const INVENTORY_MD = 'evidence/SPEC-2302/inventory.md';

/** Python handler module -> target context of the migration (P20 plan "Default mapping"). */
export const CONTEXT_BY_MODULE = {
  assessments: 'assessments',
  auth: 'identity',
  billing: 'billing',
  content: 'content',
  dev: 'dev',
  engagement: 'engagement',
  formation: 'formation',
  health: 'special',
  home: 'identity',
  identity: 'identity',
  learning: 'learning',
  privacy: 'privacy',
  tutor: 'tutor',
};

/** Spec of the python-migration track that ported a context (P20 plan, P22 plan). */
export const SPEC_BY_CONTEXT = {
  assessments: 'SPEC-2202',
  billing: 'SPEC-2206',
  content: 'SPEC-2203',
  dev: 'SPEC-2207',
  engagement: 'SPEC-2205',
  formation: 'SPEC-2201',
  identity: 'SPEC-2201',
  learning: 'SPEC-2202',
  privacy: 'SPEC-2206',
  special: 'SPEC-2207',
  tutor: 'SPEC-2204',
};

/**
 * TypeScript backend paths SPEC-2302 removes (`apps/api`, `apps/worker`, the eleven server
 * packages). A path that reappears is a regression of EF-2.
 */
export const REMOVED_PATHS = [
  'apps/api',
  'apps/worker',
  'packages/api-routes',
  'packages/automations',
  'packages/http',
  'packages/ingestion',
  'packages/jobs',
  'packages/learning-engine',
  'packages/llm',
  'packages/notifications',
  'packages/services',
  'packages/tutor',
];

const SKIP_DIRS = new Set(['node_modules', '.venv', '__pycache__', '.next', 'dist', 'build']);

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function exists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function listFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

/** Body between the first `open` at or after `from` and its matching `close`, exclusive. */
export function balanced(source, from, open = '(', close = ')') {
  const start = source.indexOf(open, from);
  if (start === -1) return null;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return { body: source.slice(start + 1, index), end: index };
    }
  }
  return null;
}

/** Module-level constants of a Python file: `NAME = "text"`, `NAME: Final = 5`. */
export function pythonConstants(source) {
  const constants = new Map();
  for (const match of source.matchAll(
    /^([A-Z][A-Z0-9_]*)\s*(?::\s*[^=\n]+)?=\s*(?:"([^"\n]*)"|'([^'\n]*)'|(\d+))\s*$/gm,
  )) {
    constants.set(match[1], match[2] ?? match[3] ?? Number(match[4]));
  }
  return constants;
}

/** Resolves a Python expression to its literal value through the module constants. */
export function resolveValue(expression, constants) {
  const text = String(expression).trim();
  const quoted = /^["'](.*)["']$/s.exec(text);
  if (quoted !== null) return quoted[1];
  if (/^\d+$/.test(text)) return Number(text);
  if (constants.has(text)) return constants.get(text);
  return null;
}

/** Hono notation of a contract path: `/x/{id}` -> `/x/:id` (the inventory's special routes). */
export function honoPath(contractPath) {
  return contractPath.replace(/\{([^}]+)\}/g, ':$1');
}

/** Operations of `api/openapi.yaml`, read from `x-learny` (ADR-2004, ADR-2012). */
export function contractOperations(root = ROOT) {
  const file = path.join(root, CONTRACT_FILE);
  if (!fs.existsSync(file)) return [];
  const document = parseYaml(readText(file));
  const operations = [];
  for (const [routePath, item] of Object.entries(document?.paths ?? {})) {
    for (const [method, operation] of Object.entries(item ?? {})) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const policy = operation?.['x-learny'] ?? {};
      operations.push({
        id: String(policy.id ?? operation?.operationId ?? `${method}:${routePath}`),
        method: method.toUpperCase(),
        path: routePath,
        auth: String(policy.auth ?? 'user'),
        rateLimit: String(policy.rateLimit ?? 'default'),
        idempotent: policy.idempotent === true,
        requiresIdempotencyKey: policy.requiresIdempotencyKey === true,
        freshAuth: policy.freshAuth === true,
        legalAcceptance: policy.legalAcceptance === true,
        validationStatus: Number(policy.validationStatus ?? 400),
        successStatus: Number(policy.successStatus ?? 200),
        summary: String(operation?.summary ?? operation?.description ?? ''),
      });
    }
  }
  return operations.sort((left, right) => left.id.localeCompare(right.id));
}

/** Route id -> handler module, from the `@handler("<id>")` decorator of the facade (ADR-2012). */
export function pythonHandlers(root = ROOT) {
  const handlers = new Map();
  const dirs = [HANDLERS_DIR, SPECIAL_DIR].map((dir) => path.join(root, dir));
  for (const dir of dirs) {
    for (const file of listFiles(dir, (entry) => entry.endsWith('.py'))) {
      for (const match of readText(file).matchAll(/^@handler\(\s*["']([^"']+)["']\s*\)/gm)) {
        handlers.set(match[1], relative(root, file));
      }
    }
  }
  return handlers;
}

/**
 * Special routes of the facade: the ids `special/__init__.py` installs plus the `*_ROUTE_ID`
 * constants of `auth_callback.py` and `sprints.py`. A route outside the contract (the sprint plan)
 * carries its own `RouteSpec`, read for its method and path.
 */
export function specialRoutes(root = ROOT, operationsById = new Map(), handlers = new Map()) {
  const dir = path.join(root, SPECIAL_DIR);
  const registryFile = path.join(dir, '__init__.py');
  const registry = fs.existsSync(registryFile) ? readText(registryFile) : '';
  const ids = [];
  for (const name of ['DEVELOPMENT_ROUTE_IDS', 'UNGATED_ROUTE_IDS']) {
    const start = registry.indexOf(`${name}`);
    if (start === -1) continue;
    const block = balanced(registry, start, '(', ')');
    for (const match of (block?.body ?? '').matchAll(/"([^"]+)"/g)) ids.push(match[1]);
  }
  const entries = [];
  for (const file of listFiles(dir, (entry) => entry.endsWith('.py'))) {
    const source = readText(file);
    const constants = pythonConstants(source);
    for (const [name, value] of constants) {
      if (!/_ROUTE_ID$/.test(name) || typeof value !== 'string') continue;
      if (!ids.includes(value)) ids.push(value);
      const localPath = constants.get(name.replace(/_ROUTE_ID$/, '_PATH'));
      let method = null;
      let routePath = typeof localPath === 'string' ? localPath : null;
      const specStart = source.indexOf('RouteSpec(');
      if (specStart !== -1) {
        const block = balanced(source, specStart)?.body ?? '';
        const declaredId = resolveValue(/id=([^,\n]+)/.exec(block)?.[1] ?? '', constants);
        if (declaredId === value) {
          method = resolveValue(/method=([^,\n]+)/.exec(block)?.[1] ?? '', constants);
          const declaredPath = resolveValue(/path=([^,\n]+)/.exec(block)?.[1] ?? '', constants);
          routePath = typeof declaredPath === 'string' ? declaredPath : routePath;
        }
      }
      entries.push({
        id: value,
        method: typeof method === 'string' ? method.toUpperCase() : null,
        path: routePath,
        module: relative(root, file),
      });
    }
  }
  return ids.map((id) => {
    const declared = entries.find((entry) => entry.id === id) ?? null;
    const operation = operationsById.get(id) ?? null;
    const routePath = operation?.path ?? declared?.path ?? null;
    return {
      key: id,
      id,
      method: operation?.method ?? declared?.method ?? null,
      path: routePath === null ? null : honoPath(routePath),
      contractPath: routePath,
      inRegistry: operation !== null,
      handler: handlers.get(id) ?? declared?.module ?? null,
      module: declared?.module ?? null,
    };
  });
}

/** Path parameters of a Python route path, needed for Hono-notation matching in tests. */
function pathNeedles(routePath) {
  return [routePath, honoPath(routePath)];
}

/** Test files of the Python suites, indexed by content for the per-operation test lookup. */
export function pythonTests(root = ROOT) {
  const dirs = TEST_DIRS.map((dir) => path.join(root, dir));
  const index = new Map();
  for (const dir of dirs) {
    for (const file of listFiles(dir, (entry) => {
      if (!entry.endsWith('.py')) return false;
      return relative(root, entry).includes('/tests/') || path.basename(entry).startsWith('test_');
    })) {
      const text = readText(file);
      index.set(relative(root, file), {
        text,
        // `[SPEC-xxxx]` tags of the SDD suites (specs are named in the test module docstring).
        tags: [...new Set([...text.matchAll(/\[(SPEC-\d+)\]/g)].map((match) => match[1]))].sort(),
      });
    }
  }
  return index;
}

function testsFor(operation, index) {
  if (operation.path === null) return [];
  const needles = [operation.id, ...pathNeedles(operation.path)].filter(
    (needle) => typeof needle === 'string' && needle.length > 3,
  );
  const found = [];
  for (const [file, { text }] of index) {
    if (needles.some((needle) => text.includes(needle))) found.push(file);
  }
  return found.sort();
}

/** One `Consumer(...)` of `learny_worker/consumers.py`. */
export function pythonConsumers(root = ROOT) {
  const file = path.join(root, CONSUMERS_FILE);
  if (!fs.existsSync(file)) return [];
  const source = readText(file);
  const constants = pythonConstants(source);
  const start = source.indexOf('CONSUMERS');
  const block = start === -1 ? null : balanced(source, start);
  if (block === null) return [];
  const consumers = [];
  let cursor = block.body.indexOf('Consumer(');
  while (cursor !== -1) {
    const entry = balanced(block.body, cursor);
    if (entry === null) break;
    const read = (pattern) => {
      const match = pattern.exec(entry.body);
      return match === null ? null : resolveValue(match[1], constants);
    };
    const name = read(/name=([^,\n]+)/);
    const event = read(/\bon=([^,\n]+)/);
    const run = /run=([a-z_][a-z0-9_]*)/.exec(entry.body)?.[1] ?? null;
    const tags = /"context":\s*"([^"]+)"/.exec(entry.body)?.[1] ?? null;
    const timeout = read(/timeout_s=([^,\n]+)/);
    const attempts = read(/max_attempts=([^,\n]+)/);
    consumers.push({
      name: typeof name === 'string' ? name : null,
      event: typeof event === 'string' ? event : null,
      run,
      context: tags,
      timeoutS: typeof timeout === 'number' ? timeout : null,
      maxAttempts: typeof attempts === 'number' ? attempts : null,
      delayed: /run_at=/.test(entry.body),
      module: path.relative(root, file).split(path.sep).join('/'),
    });
    cursor = block.body.indexOf('Consumer(', entry.end);
  }
  return consumers.sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

/** The two cron ticks of `learny_worker/scheduler.py`, with their consumers (SPEC-2102). */
export function pythonCrons(consumers = [], root = ROOT) {
  const file = path.join(root, SCHEDULER_FILE);
  if (!fs.existsSync(file)) return [];
  const constants = pythonConstants(readText(file));
  const schedule = (minute, hour) =>
    hour === undefined ? `${minute} * * * *` : `${minute} ${hour} * * *`;
  const crons = [];
  const hourly = constants.get('CRON_HOURLY');
  if (typeof hourly === 'string') {
    crons.push({
      event: hourly,
      schedule: schedule(constants.get('HOURLY_MINUTE') ?? 5),
      task: 'expire due automations, emit user/local-tick, emit the tick',
      consumers: consumers.filter((entry) => entry.event === hourly).map((entry) => entry.name),
    });
  }
  const nightly = constants.get('CRON_NIGHTLY');
  if (typeof nightly === 'string') {
    crons.push({
      event: nightly,
      schedule: schedule(constants.get('NIGHTLY_MINUTE') ?? 30, constants.get('NIGHTLY_HOUR') ?? 1),
      task: 'fan out the nightly treatments',
      consumers: consumers.filter((entry) => entry.event === nightly).map((entry) => entry.name),
    });
  }
  return crons.sort((left, right) => String(left.event).localeCompare(String(right.event)));
}

/** Paths of the removed TypeScript backend that still exist (a non-empty list is a regression). */
export function remainingTsPaths(root = ROOT) {
  return REMOVED_PATHS.filter((relativePath) => exists(root, relativePath));
}

/** Event names of the outbox catalogue (`api/events.schema.json`). */
export function eventCatalog(root = ROOT) {
  const file = path.join(root, EVENTS_FILE);
  if (!fs.existsSync(file)) return [];
  const catalog = JSON.parse(readText(file));
  return Object.keys(catalog).sort();
}

function contextOf(operation, handlers, specialIds) {
  if (specialIds.has(operation.id)) return 'special';
  const module = handlers.get(operation.id);
  const base = module === undefined ? null : path.basename(module, '.py');
  if (base !== null && CONTEXT_BY_MODULE[base] !== undefined) return CONTEXT_BY_MODULE[base];
  return 'dev';
}

/** Builds the inventory. `deps` is injectable so unit tests run on fixtures without the tree. */
export function buildInventory({
  root = ROOT,
  operations = contractOperations(root),
  handlers = pythonHandlers(root),
  consumers = pythonConsumers(root),
  crons = pythonCrons(consumers, root),
  catalog = eventCatalog(root),
  index = pythonTests(root),
  removed = remainingTsPaths(root),
} = {}) {
  const operationsById = new Map(operations.map((entry) => [entry.id, entry]));
  const specials = specialRoutes(root, operationsById, handlers);
  const specialIds = new Set(specials.map((entry) => entry.id));

  const operationEntries = operations.map((operation) => {
    const context = contextOf(operation, handlers, specialIds);
    const handler = handlers.get(operation.id) ?? null;
    const special = specials.find((entry) => entry.id === operation.id) ?? null;
    const entry = {
      key: operation.id,
      id: operation.id,
      method: operation.method,
      path: operation.path,
      auth: operation.auth,
      rateLimit: operation.rateLimit,
      idempotent: operation.idempotent,
      requiresIdempotencyKey: operation.requiresIdempotencyKey,
      freshAuth: operation.freshAuth,
      legalAcceptance: operation.legalAcceptance,
      validationStatus: operation.validationStatus,
      successStatus: operation.successStatus,
      summary: operation.summary,
      context,
      spec: SPEC_BY_CONTEXT[context] ?? 'SPEC-2207',
      handler,
      installedBy: specialIds.has(operation.id) ? 'special' : 'pipeline',
      specialModule: special === null ? null : special.module,
      tests: [],
      gap: false,
    };
    entry.served = handler !== null || specialIds.has(operation.id);
    entry.tests = testsFor(entry, index);
    entry.gap = entry.tests.length === 0;
    return entry;
  });

  const specialEntries = specials.map((special) => ({
    ...special,
    context: 'special',
    spec: SPEC_BY_CONTEXT.special,
    tests: testsFor({ id: special.id, path: special.contractPath }, index),
  }));

  const consumedEvents = [
    ...new Set([
      ...consumers.map((entry) => entry.event).filter((event) => typeof event === 'string'),
      ...crons.map((entry) => entry.event),
    ]),
  ].sort();
  const knownEvents = new Set(catalog);
  const unknownEvents = consumedEvents.filter((event) => !knownEvents.has(event));

  const counts = {
    operations: operationEntries.length,
    special: specialEntries.length,
    consumers: consumers.length,
    crons: crons.length,
    events: consumedEvents.length,
    handlers: handlers.size,
    gaps: operationEntries.filter((entry) => entry.gap).length,
    operationsWithoutHandler: operationEntries.filter((entry) => !entry.served).length,
    specialWithoutInstall: specialEntries.filter(
      (entry) => entry.method === null || entry.path === null || entry.handler === null,
    ).length,
    consumersWithoutEvent: consumers.filter((entry) => entry.event === null).length,
    unknownEvents: unknownEvents.length,
    remainingTypeScript: removed.length,
  };

  return {
    generatedFrom: 'SPEC-2302',
    sources: [
      CONTRACT_FILE,
      EVENTS_FILE,
      HANDLERS_DIR,
      SPECIAL_DIR,
      CONSUMERS_FILE,
      SCHEDULER_FILE,
    ],
    counts,
    operations: operationEntries,
    special: specialEntries,
    consumers,
    crons,
    events: consumedEvents.map((name) => ({
      name,
      consumers: consumers.filter((entry) => entry.event === name).map((entry) => entry.name),
      inCatalog: knownEvents.has(name),
    })),
    removedTypeScript: REMOVED_PATHS.map((relativePath) => ({
      path: relativePath,
      present: removed.includes(relativePath),
    })),
    python: { testFiles: index.size },
  };
}

/** The verdict SPEC-2302 CA-3 and EF-4 require; an empty list means the inventory is green. */
export function inventoryResidue(inventory) {
  const residue = [];
  const { counts } = inventory;
  if (counts.operationsWithoutHandler > 0) {
    residue.push(`${counts.operationsWithoutHandler} operation(s) without a Python handler`);
  }
  if (counts.specialWithoutInstall > 0) {
    residue.push(`${counts.specialWithoutInstall} special route(s) not installed by Python`);
  }
  if (counts.consumersWithoutEvent > 0) {
    residue.push(`${counts.consumersWithoutEvent} consumer(s) without an event`);
  }
  if (counts.unknownEvents > 0) {
    residue.push(`${counts.unknownEvents} consumed event(s) outside api/events.schema.json`);
  }
  if (counts.remainingTypeScript > 0) {
    const present = inventory.removedTypeScript.filter((entry) => entry.present);
    residue.push(
      `TypeScript backend path(s) still present: ${present.map((e) => e.path).join(', ')}`,
    );
  }
  return residue;
}

/** Human-readable verdict lines (shared by `--runtime`, `--check` and the report). */
export function verdictLines(inventory) {
  const { counts } = inventory;
  return [
    `${counts.operations}/${counts.operations} operations served by Python ` +
      `(${counts.handlers} @handler, ${counts.special} installed by the special registry)`,
    `${counts.special}/${counts.special} special routes installed by Python`,
    `${counts.consumers} event consumers, all in learny_worker/consumers.py`,
    `${counts.crons} cron ticks, all in learny_worker/scheduler.py`,
    `${counts.events} consumed events, all declared in api/events.schema.json` +
      (counts.unknownEvents === 0 ? '' : ` (${counts.unknownEvents} unknown)`),
    `TypeScript backend paths remaining: ${counts.remainingTypeScript} of ${REMOVED_PATHS.length}`,
  ];
}

function tableCell(value) {
  return value === null || value === undefined || value === ''
    ? '—'
    : String(value).replace(/\|/g, '\\|');
}

/** Markdown rendering of the inventory (evidence/SPEC-2302/inventory.md). */
export function renderInventoryMarkdown(inventory) {
  const { counts } = inventory;
  const lines = [];
  lines.push('# Inventory — Python backend after the TypeScript removal (SPEC-2302)');
  lines.push('');
  lines.push(
    `Generated by \`node tools/migration/inventory.mjs\` from ${inventory.sources
      .map((source) => `\`${source}\``)
      .join(
        ', ',
      )}. Do not edit by hand: \`--check\` fails when this file or \`api/inventory.json\` ` +
      'drifts from the code.',
  );
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Kind | Count |');
  lines.push('|---|---|');
  lines.push(`| Operations of the contract | ${counts.operations} |`);
  lines.push(`| Special routes | ${counts.special} |`);
  lines.push(`| \`@handler\` decorators | ${counts.handlers} |`);
  lines.push(`| Event consumers (Python worker) | ${counts.consumers} |`);
  lines.push(`| Cron ticks (Python scheduler) | ${counts.crons} |`);
  lines.push(`| Consumed events | ${counts.events} |`);
  lines.push(`| Operations without a Python handler | ${counts.operationsWithoutHandler} |`);
  lines.push(`| Special routes not installed by Python | ${counts.specialWithoutInstall} |`);
  lines.push(`| Consumed events outside the catalogue | ${counts.unknownEvents} |`);
  lines.push(`| Removed TypeScript backend paths still present | ${counts.remainingTypeScript} |`);
  lines.push(`| Operations without a tagged test (informational) | ${counts.gaps} |`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  const residue = inventoryResidue(inventory);
  for (const line of verdictLines(inventory)) lines.push(`- ${line}`);
  lines.push(
    residue.length === 0
      ? '- No residue: every operation, special route, consumer and cron is served by Python.'
      : `- Residue: ${residue.join(' ; ')}`,
  );
  lines.push('');
  lines.push('## Operations');
  lines.push('');
  lines.push('| Id | Method | Path | Auth | Context | Handler | Installed by | Tests |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const operation of inventory.operations) {
    const handler = operation.handler ?? operation.specialModule ?? null;
    lines.push(
      `| \`${operation.id}\` | ${operation.method} | \`${operation.path}\` | ${operation.auth} | ` +
        `${operation.context} | ${handler === null ? '—' : `\`${handler}\``} | ` +
        `${operation.installedBy} | ${operation.tests.length} |`,
    );
  }
  lines.push('');
  lines.push('## Special routes');
  lines.push('');
  lines.push('| Id | Method | Path | In contract | Installed by | Tests |');
  lines.push('|---|---|---|---|---|---|');
  for (const special of inventory.special) {
    lines.push(
      `| \`${special.id}\` | ${tableCell(special.method)} | \`${tableCell(special.path)}\` | ` +
        `${special.inRegistry ? 'yes' : 'no'} | \`${tableCell(special.module)}\` | ${special.tests.length} |`,
    );
  }
  lines.push('');
  lines.push('## Event consumers (Python worker)');
  lines.push('');
  lines.push('| Consumer | Event | Context | Attempts | Delayed | Module |');
  lines.push('|---|---|---|---|---|---|');
  for (const consumer of inventory.consumers) {
    lines.push(
      `| \`${tableCell(consumer.name)}\` | \`${tableCell(consumer.event)}\` | ` +
        `${tableCell(consumer.context)} | ${tableCell(consumer.maxAttempts)} | ` +
        `${consumer.delayed ? 'run_at' : '—'} | \`${consumer.module}\` |`,
    );
  }
  lines.push('');
  lines.push('## Cron ticks (Python scheduler)');
  lines.push('');
  lines.push('| Event | Schedule (UTC) | Task | Consumers |');
  lines.push('|---|---|---|---|');
  for (const cron of inventory.crons) {
    lines.push(
      `| \`${cron.event}\` | \`${cron.schedule}\` | ${cron.task} | ${cron.consumers.length} |`,
    );
  }
  lines.push('');
  lines.push('## Removed TypeScript backend');
  lines.push('');
  lines.push('| Path | Present |');
  lines.push('|---|---|');
  for (const entry of inventory.removedTypeScript) {
    lines.push(`| \`${entry.path}\` | ${entry.present ? '**yes (regression)**' : 'no'} |`);
  }
  lines.push('');
  return `${lines.join('\n')}`;
}

export function serialize(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

/** Prints the coverage verdict; returns the process exit code (0 when nothing remains). */
export function runtime(inventory, log = console.log) {
  log(`Python backend inventory (SPEC-2302, ADR-2006) :`);
  for (const line of verdictLines(inventory)) log(`  ${line}`);
  const residue = inventoryResidue(inventory);
  if (residue.length === 0) {
    log('  Résultat : aucun chemin résiduel TypeScript.');
    return 0;
  }
  for (const line of residue) console.error(`  ✖ ${line}`);
  return 1;
}

export function main(argv = process.argv.slice(2), root = ROOT) {
  const check = argv.includes('--check');
  const runtimeOnly = argv.includes('--runtime');
  const inventory = buildInventory({ root });

  if (runtimeOnly) {
    process.exitCode = runtime(inventory);
    return inventory;
  }

  const jsonPath = path.join(root, INVENTORY_JSON);
  const markdownPath = path.join(root, INVENTORY_MD);
  const json = serialize(inventory);
  const markdown = renderInventoryMarkdown(inventory);

  if (check) {
    const drift = [];
    if (!fs.existsSync(jsonPath) || readText(jsonPath) !== json) drift.push(INVENTORY_JSON);
    if (!fs.existsSync(markdownPath) || readText(markdownPath) !== `${markdown}\n`) {
      drift.push(INVENTORY_MD);
    }
    if (drift.length > 0) {
      console.error(
        `Inventory drift: ${drift.join(', ')} does not match the contract and the Python sources ` +
          '(node tools/migration/inventory.mjs).',
      );
      process.exitCode = 1;
      return inventory;
    }
    console.log(`Inventory up to date: ${inventory.counts.operations} operations.`);
    return inventory;
  }

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(jsonPath, json);
  fs.writeFileSync(markdownPath, `${markdown}\n`);
  console.log(
    `Inventory written: ${inventory.counts.operations} operations, ` +
      `${inventory.counts.special} special routes, ${inventory.counts.consumers} consumers, ` +
      `${inventory.counts.crons} crons, ${inventory.counts.remainingTypeScript} TypeScript ` +
      'backend path(s) remaining.',
  );
  return inventory;
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;
if (entry !== null && fileURLToPath(entry) === fileURLToPath(import.meta.url)) {
  main();
}
