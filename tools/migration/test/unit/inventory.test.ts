// [SPEC-2001] Inventory, parity matrix and reference oracles.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SPECIAL_ROUTE_MANIFEST } from '../../../../packages/api-routes/src/special/manifest';
import { EVENTS } from '../../../../packages/contracts/src/events';
import { ROUTES } from '../../../../packages/contracts/src/routes';
import {
  ROOT,
  buildInventory,
  buildPortMap,
  eventUsage,
  jobDefinitions,
  renderInventoryMarkdown,
  serialize,
  testIndex,
  trackSpecFor,
} from '../../inventory.mjs';

interface InventoryOperation {
  id: string;
  method: string;
  path: string;
  auth: string;
  context: string;
  spec: string;
  implementation: string | null;
  tables: string[];
  tests: string[];
  gap: boolean;
}

interface Inventory {
  counts: { operations: number; special: number; events: number; jobs: number; gaps: number };
  operations: InventoryOperation[];
  special: { key: string; path: string; method: string }[];
  events: { name: string }[];
  jobs: { id: string }[];
}

interface PortMapRow {
  file: string;
  tests: number;
  python: string;
  spec: string;
  status: string;
}

const registry = {
  routes: ROUTES as unknown as Record<string, never>,
  special: SPECIAL_ROUTE_MANIFEST,
  events: EVENTS as unknown as Record<string, unknown>,
};

function realInventory(): Inventory {
  return buildInventory({
    root: ROOT,
    deps: {
      ...registry,
      jobs: jobDefinitions(ROOT),
      usage: eventUsage(ROOT),
      index: testIndex(ROOT),
    },
  }) as unknown as Inventory;
}

function portMap(): PortMapRow[] {
  return buildPortMap(ROOT);
}

describe('[SPEC-2001] inventory extractor', () => {
  it('fails when the committed inventory drifts from the registries (CA-2)', () => {
    const committed = fs.readFileSync(path.join(ROOT, 'api', 'inventory.json'), 'utf8');
    expect(committed).toBe(serialize(realInventory()));
  });

  it('covers the 217 operations of the registry and every event and job (CA-1)', () => {
    const inventory = realInventory();
    expect(inventory.counts.operations).toBe(217);
    expect(inventory.counts.events).toBe(49);
    expect(inventory.counts.jobs).toBe(22);
    expect(Object.keys(ROUTES)).toHaveLength(217);
  });

  it('gives every operation an actor, a target context and a target spec (CA-1)', () => {
    const inventory = realInventory();
    for (const operation of inventory.operations) {
      expect(['user', 'public']).toContain(operation.auth);
      expect(operation.context).not.toBe('');
      expect(operation.spec).toMatch(/^SPEC-2\d{3}$/);
      expect(operation.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
      // An operation is either implemented by a module or hosted by a special handler.
      const special = inventory.special.some(
        (item) => item.path === operation.path && item.method === operation.method,
      );
      expect(operation.implementation !== null || special).toBe(true);
    }
  });

  it('flags the operations without any test as CL-1 gaps', () => {
    const inventory = realInventory();
    const gaps = inventory.operations.filter((operation) => operation.gap);
    expect(inventory.counts.gaps).toBe(gaps.length);
    for (const operation of gaps) expect(operation.tests).toEqual([]);
  });

  it('documents a table for the SQL-backed operations of the agenda (ET-3)', () => {
    const inventory = realInventory();
    const agenda = inventory.operations.find((operation) => operation.id === 'agenda.get');
    expect(agenda?.tables).toContain('schedule_slots');
  });

  it('serialises deterministically: two builds give byte-identical JSON (CA-3)', () => {
    expect(serialize(realInventory())).toBe(serialize(realInventory()));
  });

  it('renders every operation id in the markdown matrix (CA-1)', () => {
    const inventory = realInventory();
    const markdown = renderInventoryMarkdown(inventory);
    const missing = inventory.operations.filter(
      (operation) => !markdown.includes(`\`${operation.id}\``),
    );
    expect(missing).toEqual([]);
    expect(markdown).toContain('| Operations (`ROUTES`) | 217 |');
  });
});

describe('[SPEC-2001] test port map', () => {
  it('maps every backend test file to a pytest module and a python-track spec (CA-4)', () => {
    const rows = portMap();
    expect(rows.length).toBeGreaterThan(400);
    for (const row of rows) {
      expect(row.python).toMatch(/tests\/(?:unit|integration)\/(?:.*\/)?test_.+\.py$/);
      expect(row.spec).toMatch(/^SPEC-2\d{3}$/);
      expect(row.status).toBe('todo');
    }
  });

  it('routes a services test to the context that ports it', () => {
    expect(trackSpecFor('services', 'agenda')).toBe('SPEC-2202');
    expect(trackSpecFor('services', 'attempts')).toBe('SPEC-2202');
    expect(trackSpecFor('db', 'identity')).toBe('SPEC-2101');
    expect(trackSpecFor('learning-engine', 'engine')).toBe('SPEC-2202');
  });
});
