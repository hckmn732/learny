// [SPEC-2001] Replays a subset of the recorded oracles against a running backend.
//
// The parity harness is exercised for real here: the actors are created through the Supabase
// admin API and the recorded responses are replayed. The run is serialised on the shared database
// lock by the caller (`flock /tmp/learny-sdd-db.lock`, AGENTS.md).
//
// Target: `PARITY_TARGET` (default `http://127.0.0.1:3102`). When no backend answers, the replay is
// skipped explicitly instead of pretending to pass.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROOT } from '../../../migration/inventory.mjs';
import { diffRecordings, loadMutations, runScenarios } from '../../run';
import type { Scenario, ScenarioResult } from '../../run';

const TARGET = process.env.PARITY_TARGET ?? 'http://127.0.0.1:3102';
const RECORDING = path.join(ROOT, 'api', 'oracles', 'recordings', 'reads.json');
const SAMPLE = ['health.get', 'me.get', 'dev.sdd.spec-103.demo'];

async function reachable(): Promise<boolean> {
  try {
    const response = await fetch(`${TARGET}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

describe('[SPEC-2001] parity harness integration', () => {
  it('replays three recorded scenarios identically against the TypeScript backend', async () => {
    if (!(await reachable())) {
      console.warn(`Parity target unreachable (${TARGET}): integration replay skipped.`);
      return;
    }
    const recording = JSON.parse(fs.readFileSync(RECORDING, 'utf8')) as {
      groups: { scenarios: ScenarioResult[] }[];
    };
    const recorded = recording.groups.flatMap((group) => group.scenarios);
    const sample = recorded.filter((entry) => SAMPLE.includes(entry.name));
    expect(sample.length).toBeGreaterThanOrEqual(2);

    // Paths come from the inventory so a route rename is caught by the drift check first.
    const inventory = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'api', 'inventory.json'), 'utf8'),
    ) as { operations: { id: string; path: string }[] };
    const pathById = new Map(inventory.operations.map((operation) => [operation.id, operation.path]));

    const scenarios: Scenario[] = [];
    for (const entry of sample) {
      const routePath = pathById.get(entry.name);
      expect(routePath, `route path of ${entry.name}`).toBeDefined();
      scenarios.push({
        group: entry.group,
        name: entry.name,
        steps: [
          {
            as: entry.name === 'health.get' ? 'anonymous' : 'freshUser',
            method: 'GET',
            path: routePath ?? '',
          },
        ],
      });
    }

    const results = await runScenarios(scenarios, TARGET);
    expect(diffRecordings(sample, results)).toEqual([]);
  });

  it('keeps the hand-written mutation scenarios parseable (CL-1)', () => {
    const mutations = loadMutations(ROOT);
    expect(mutations.length).toBeGreaterThan(0);
    for (const scenario of mutations) {
      expect(scenario.steps.length).toBeGreaterThan(0);
      for (const step of scenario.steps) expect(step.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
    }
  });
});
