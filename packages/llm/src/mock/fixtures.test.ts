import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FIXTURE_REGISTRY } from './fixture-registry';
import { FIXTURE_FILE_SCHEMA } from './fixture-schema';

const ROOT = fileURLToPath(new URL('../../fixtures', import.meta.url));
const PROMPTS = fileURLToPath(new URL('../../fixtures/prompts/index.json', import.meta.url));

function fixtureFiles(dir: string, prefix = ''): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        return entry.name === 'prompts' ? [] : fixtureFiles(path.join(dir, entry.name), relative);
      }
      return entry.name.endsWith('.json') && entry.name !== 'fixture.schema.json'
        ? [relative]
        : [];
    })
    .sort();
}

function promptVersions(): Record<string, number> {
  const declared = JSON.parse(fs.readFileSync(PROMPTS, 'utf8')) as Record<string, number>;
  return declared;
}

describe('[SPEC-504] fixtures du dépôt', () => {
  it('CA-4 — toutes les fixtures du disque sont enregistrées et valides', () => {
    const onDisk = fixtureFiles(ROOT);
    const registered = FIXTURE_REGISTRY.map((entry) => entry.path).sort();
    expect(registered).toEqual(onDisk);
    for (const entry of FIXTURE_REGISTRY) {
      expect(FIXTURE_FILE_SCHEMA.safeParse(entry.fixture).success).toBe(true);
    }
  });

  it('CA-4 — promptVersion correspond à la version déclarée de la consigne', () => {
    const versions = promptVersions();
    for (const entry of FIXTURE_REGISTRY) {
      const version = versions[entry.fixture.promptId];
      expect(version, `consigne ${entry.fixture.promptId} déclarée`).toBeTypeOf('number');
      expect(entry.fixture.promptVersion, entry.path).toBe(version);
    }
  });

  it('CA-4 — chaque étape de tous les types est représentée au moins une fois', () => {
    const types = new Set(
      FIXTURE_REGISTRY.flatMap((entry) => entry.fixture.steps.map((step) => step.type)),
    );
    expect([...types].sort()).toEqual(['error', 'object', 'stream', 'text', 'tool-calls']);
    const errorKinds = new Set(
      FIXTURE_REGISTRY.flatMap((entry) =>
        entry.fixture.steps.flatMap((step) =>
          step.type === 'error' ? [step.error.kind] : [],
        ),
      ),
    );
    expect(errorKinds.has('refusal')).toBe(true);
    expect(errorKinds.has('timeout')).toBe(true);
  });
});
