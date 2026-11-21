// SPEC-2001 — parity runner (ADR-2008, P20 plan §3).
//
// Records the reference responses of the TypeScript backend and replays them against any target
// (the Hono API today, the Python facade tomorrow). Comparison is semantic: status, an allow-list
// of headers, and the JSON body after normalisation of the non-deterministic values (CL-2).
//
//   corepack pnpm exec tsx tools/parity/run.mts --record --target http://127.0.0.1:3102
//   corepack pnpm exec tsx tools/parity/run.mts --check  --target http://127.0.0.1:3102
//
// Generated scenarios cover every side-effect-free read operation of the inventory (one success
// scenario per read route, P20 plan §3). Mutations are hand-written in
// `tools/parity/scenarios/mutations.json` because they need an ordered chain of fixtures.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '../../packages/testing/src/supabase';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface Step {
  as: 'anonymous' | 'freshUser';
  method: string;
  path: string;
  body?: unknown;
  /** Hand-written chains pin the key to observe a replay (`idempotent-replayed: true`). */
  idempotencyKey?: string;
  expect?: { normalize?: string[] };
}

export interface Scenario {
  group: string;
  name: string;
  steps: Step[];
}

export interface Captured {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/** Headers compared between the two runtimes (00-conventions §11). */
export const COMPARED_HEADERS = [
  'content-type',
  'cache-control',
  'retry-after',
  'location',
  'idempotent-replayed',
];

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Measured durations vary between runs: the oracle compares the shape, never the timing (CL-2). */
const DURATION_KEY_RE = /^(?:durationMs|duration|elapsedMs|tookMs|dureeMs)$/;

/** Replaces non-deterministic values so the same input always produces the same oracle (CL-2). */
export function normalizeBody(value: unknown): unknown {
  if (typeof value === 'string') {
    // `EXPLAIN (FORMAT JSON)` blocks exposed by the dev demo pages: planner costs vary with
    // statistics between two runs, the shape does not (CL-2).
    if (value.includes('"Node Type"') && value.includes('"Startup Cost"')) return '<explain>';
    return value.replace(UUID_RE, '<uuid>').replace(ISO_RE, '<timestamp>').replace(EMAIL_RE, '<email>');
  }
  if (Array.isArray(value)) return value.map(normalizeBody);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = DURATION_KEY_RE.test(key) ? '<duration>' : normalizeBody(item);
    }
    return out;
  }
  return value;
}

/** Server timing and numeric variance are normalised out of the header allow-list. */
export function normalizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of COMPARED_HEADERS) {
    const value = headers.get(name);
    if (value !== null) out[name] = value.replace(/\d+(\.\d+)?/g, '<n>');
  }
  return out;
}

/** Generated read scenarios: one GET per operation without a path parameter (P20 plan §3). */
export function generatedScenarios(inventory: {
  operations: { id: string; method: string; path: string; auth: string; context: string }[];
}): Scenario[] {
  const scenarios: Scenario[] = [];
  for (const operation of inventory.operations) {
    if (operation.method !== 'GET') continue;
    if (operation.path.includes(':')) continue;
    scenarios.push({
      group: operation.context,
      name: operation.id,
      steps: [
        {
          as: operation.auth === 'public' ? 'anonymous' : 'freshUser',
          method: 'GET',
          path: operation.path,
        },
      ],
    });
  }
  return scenarios;
}

export function loadMutations(root = REPO_ROOT): Scenario[] {
  const file = path.join(root, 'tools', 'parity', 'scenarios', 'mutations.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Scenario[];
}

async function executeStep(
  step: Step,
  target: string,
  idempotencyKey: string,
  actors: Map<string, TestSession | null>,
): Promise<Captured> {
  const session = step.as === 'freshUser' ? actors.get('freshUser') : null;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (session !== null && session !== undefined) headers.cookie = session.cookieHeader;
  if (step.body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['idempotency-key'] = step.idempotencyKey ?? idempotencyKey;
  }
  const response = await fetch(`${target}${step.path}`, {
    method: step.method,
    headers,
    body: step.body === undefined ? undefined : JSON.stringify(step.body),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text;
  }
  return {
    status: response.status,
    headers: normalizeHeaders(response.headers),
    body: normalizeBody(body),
  };
}

export interface ScenarioResult {
  name: string;
  group: string;
  steps: Captured[];
}

export async function runScenarios(scenarios: Scenario[], target: string): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    const actors = new Map<string, TestSession | null>();
    const needsUser = scenario.steps.some((step) => step.as === 'freshUser');
    if (needsUser) actors.set('freshUser', await createTestSession());
    try {
      const steps: Captured[] = [];
      for (const [index, step] of scenario.steps.entries()) {
        steps.push(await executeStep(step, target, `parity-${scenario.name}-${String(index)}`, actors));
      }
      results.push({ name: scenario.name, group: scenario.group, steps });
    } finally {
      const session = actors.get('freshUser');
      if (session !== null && session !== undefined) await deleteTestSession(session);
    }
  }
  return results;
}

export function serializeRecording(results: ScenarioResult[]): string {
  const byGroup = new Map<string, ScenarioResult[]>();
  for (const result of results) {
    if (!byGroup.has(result.group)) byGroup.set(result.group, []);
    byGroup.get(result.group)?.push(result);
  }
  const groups = [...byGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, entries]) => ({
      group,
      scenarios: entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({ name: entry.name, steps: entry.steps })),
    }));
  return `${JSON.stringify({ version: 1, groups }, null, 2)}\n`;
}

/** First JSON path where two captured values differ (diagnostics of a divergence). */
export function firstDifference(expected: unknown, actual: unknown, pointer = ''): string | null {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return null;
  if (
    expected !== null &&
    actual !== null &&
    typeof expected === 'object' &&
    typeof actual === 'object'
  ) {
    const expectedObject = expected as Record<string, unknown>;
    const actualObject = actual as Record<string, unknown>;
    const keys = new Set([...Object.keys(expectedObject), ...Object.keys(actualObject)]);
    for (const key of keys) {
      const diff = firstDifference(expectedObject[key], actualObject[key], `${pointer}/${key}`);
      if (diff !== null) return diff;
    }
    return `${pointer || '/'}: object shape differs`;
  }
  return `${pointer || '/'}: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`;
}

export function diffRecordings(expected: ScenarioResult[], actual: ScenarioResult[]): string[] {
  const diffs: string[] = [];
  const actualByName = new Map(actual.map((entry) => [entry.name, entry]));
  for (const entry of expected) {
    const other = actualByName.get(entry.name);
    if (other === undefined) {
      diffs.push(`${entry.name}: scenario missing from the target`);
      continue;
    }
    if (JSON.stringify(entry.steps) !== JSON.stringify(other.steps)) {
      const pointer =
        entry.steps.length !== other.steps.length
          ? `step count ${String(entry.steps.length)} != ${String(other.steps.length)}`
          : (firstDifference(entry.steps, other.steps) ?? '');
      diffs.push(`${entry.name}: response differs from the recording (${pointer})`);
    }
  }
  return diffs;
}

export const RECORDING_FILE = path.join(REPO_ROOT, 'api', 'oracles', 'recordings', 'reads.json');

async function main(argv: string[]): Promise<void> {
  const targetIndex = argv.indexOf('--target');
  const target = targetIndex === -1 ? 'http://127.0.0.1:3102' : argv[targetIndex + 1];
  if (target === undefined) throw new Error('--target <url> is required');
  const check = argv.includes('--check');
  const inventory = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'api', 'inventory.json'), 'utf8'),
  ) as {
    operations: { id: string; method: string; path: string; auth: string; context: string }[];
  };
  const scenarios = [...generatedScenarios(inventory), ...loadMutations(REPO_ROOT)];
  const results = await runScenarios(scenarios, target);

  if (!check) {
    fs.mkdirSync(path.dirname(RECORDING_FILE), { recursive: true });
    fs.writeFileSync(RECORDING_FILE, serializeRecording(results));
    console.log(`Recorded ${results.length} scenarios against ${target}`);
    return;
  }

  if (!fs.existsSync(RECORDING_FILE)) throw new Error('No recording: run --record first');
  const recording = JSON.parse(fs.readFileSync(RECORDING_FILE, 'utf8')) as {
    groups: { scenarios: ScenarioResult[] }[];
  };
  const expected = recording.groups.flatMap((group) => group.scenarios);
  const diffs = diffRecordings(expected, results);
  if (diffs.length > 0) {
    console.error(`Parity failed against ${target}: ${diffs.length} divergence(s)`);
    for (const diff of diffs.slice(0, 40)) console.error(`  ${diff}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Parity OK: ${results.length} scenarios replay identically against ${target}.`);
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;
if (entry !== null && fileURLToPath(entry) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
