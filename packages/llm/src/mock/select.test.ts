import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { FIXTURE_REGISTRY, type RegisteredFixture } from './fixture-registry';
import { parseFixture } from './fixture-schema';
import { canonicalJson, markerScenario, selectFixture, stripMockMarkers } from './select';

function fixture(path: string, overrides: Record<string, unknown> = {}): RegisteredFixture {
  return {
    path,
    fixture: parseFixture({
      task: 'tutor',
      scenario: path.split('/').at(-1)?.replace('.json', '') ?? 'demo',
      promptId: 'tutor.demo',
      promptVersion: 1,
      description: 'test',
      steps: [{ type: 'text', text: 'ok' }],
      ...overrides,
    }),
  };
}

const USER: ModelMessage[] = [{ role: 'user', content: 'Explique la société.' }];

describe('[SPEC-504] sélection des fixtures', () => {
  it('CA-4 — (a) le scénario explicite gagne sur tout le reste', () => {
    const fixtures = [
      fixture('tutor/alpha.json', { scenario: 'alpha' }),
      fixture('tutor/beta.json', { scenario: 'beta' }),
    ];
    const selected = selectFixture(
      { task: 'tutor', promptId: 'tutor.demo', messages: USER, explicitScenario: 'beta' },
      { fixtures },
    );
    expect(selected.ok && selected.value.scenario).toBe('beta');
  });

  it('CA-4 — (b) le marqueur choisit le scénario et est retiré du texte', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Montre [[mock:demo-tool-call]] la réponse' },
    ];
    expect(markerScenario(messages)).toBe('demo-tool-call');
    expect(stripMockMarkers(messages)).toEqual([
      { role: 'user', content: 'Montre  la réponse' },
    ]);
    const selected = selectFixture({
      task: 'tutor',
      promptId: 'tutor.demo',
      messages,
    });
    expect(selected.ok && selected.value.scenario).toBe('demo-tool-call');
  });

  it('CA-4 — (c) première fixture alphabétique dont les chaînes contiennent le texte', () => {
    const fixtures = [
      fixture('tutor/a.json', {
        scenario: 'a',
        promptId: 'tutor.demo',
        match: { contains: ['société'] },
      }),
      fixture('tutor/b.json', {
        scenario: 'b',
        promptId: 'tutor.demo',
        match: { contains: ['société', 'explique'] },
      }),
    ];
    const selected = selectFixture(
      { task: 'tutor', promptId: 'tutor.demo', messages: USER },
      { fixtures },
    );
    expect(selected.ok && selected.value.scenario).toBe('a');
  });

  it('CA-4 — (d) le fichier <promptId>.default.json est le repli', () => {
    const fixtures = [
      fixture('tutor/demo.default.json', { scenario: 'demo', promptId: 'tutor.demo' }),
      fixture('tutor/other.json', { scenario: 'other', promptId: 'tutor.other' }),
    ];
    const selected = selectFixture(
      { task: 'tutor', promptId: 'tutor.demo', messages: USER },
      { fixtures },
    );
    expect(selected.ok && selected.value.scenario).toBe('demo');
  });

  it('CA-4 — (e) aucune fixture → MOCK_FIXTURE_NOT_FOUND avec les candidats', () => {
    const selected = selectFixture(
      { task: 'tutor', promptId: 'tutor.unknown', messages: USER },
      { fixtures: FIXTURE_REGISTRY },
    );
    expect(selected.ok).toBe(false);
    if (!selected.ok) {
      expect(selected.error.code).toBe('MOCK_FIXTURE_NOT_FOUND');
      expect(selected.error.detail).toContain('tutor/');
    }
  });

  it('CA-4 — la sérialisation canonique trie les clés', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('CA-4 — les six scénarios de démonstration existent', () => {
    const scenarios = new Set(FIXTURE_REGISTRY.map((entry) => entry.fixture.scenario));
    for (const scenario of [
      'demo',
      'demo-tool-call',
      'demo-refusal',
      'demo-timeout',
      'demo-object',
      'demo-invalid-object',
    ]) {
      expect(scenarios.has(scenario)).toBe(true);
    }
  });
});
