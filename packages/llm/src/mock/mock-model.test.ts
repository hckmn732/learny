import { convertReadableStreamToArray } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { FIXTURE_REGISTRY } from './fixture-registry';
import { parseFixture, type MockErrorKind } from './fixture-schema';
import { createMockModel } from './mock-model';

function fixtureNamed(scenario: string) {
  const entry = FIXTURE_REGISTRY.find((item) => item.fixture.scenario === scenario);
  if (entry === undefined) throw new Error(`fixture ${scenario} absente`);
  return entry.fixture;
}

function errorFixture(kind: Exclude<MockErrorKind, 'refusal'>) {
  return parseFixture({
    task: 'tutor',
    scenario: `error-${kind}`,
    promptId: 'tutor.demo',
    promptVersion: 1,
    description: `erreur ${kind}`,
    steps: [{ type: 'error', error: { kind, message: `erreur ${kind}` } }],
  });
}

describe('[SPEC-504] modèle simulé', () => {
  it('CA-3 — étape texte : contenu et finishReason fidèles', async () => {
    const result = (await createMockModel(fixtureNamed('demo')).doGenerate({} as never)) as {
      content: { type: string; text?: string }[];
      finishReason: { unified: string; raw: string };
      usage: { inputTokens: { total: number } };
    };
    expect(result.content).toEqual([{ type: 'text', text: 'Bonjour !' }]);
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'end_turn' });
    expect(result.usage.inputTokens.total).toBe(24);
  });

  it('CA-3 — étape outils : appels typés avec entrée JSON', async () => {
    const result = (await createMockModel(fixtureNamed('demo-tool-call')).doGenerate(
      {} as never,
    )) as {
      content: { type: string; toolName?: string; input?: string }[];
      finishReason: { unified: string };
    };
    expect(result.finishReason.unified).toBe('tool-calls');
    expect(result.content[0]).toMatchObject({ type: 'tool-call', toolName: 'read_resources' });
    expect(JSON.parse(result.content[0]?.input ?? '{}')).toEqual({
      chapterId: 'sap-m1-c1',
      query: 'société et écritures',
    });
  });

  it('CA-3 — étape objet : texte JSON parsable', async () => {
    const result = (await createMockModel(fixtureNamed('demo-object')).doGenerate(
      {} as never,
    )) as { content: { text?: string }[] };
    expect(JSON.parse(result.content[0]?.text ?? '')).toEqual({
      title: 'Société et écritures',
      confidence: 0.92,
    });
  });

  it('CA-3 — étape flux : les chunks annoncés sont restitués', async () => {
    const streamed = await createMockModel(fixtureNamed('demo-stream')).doStream({} as never);
    const parts = await convertReadableStreamToArray(streamed.stream);
    const deltas = parts.flatMap((part) =>
      part.type === 'text-delta' ? [part.delta] : [],
    );
    expect(deltas).toEqual(['Bonjour', ' !']);
    const finish = parts.find((part) => part.type === 'finish');
    expect(finish).toMatchObject({ finishReason: { unified: 'stop' } });
  });

  it('CA-3 — refus : finishReason refusal, sans exception', async () => {
    const result = (await createMockModel(fixtureNamed('demo-refusal')).doGenerate(
      {} as never,
    )) as { content: unknown[]; finishReason: { unified: string; raw: string } };
    expect(result.content).toEqual([]);
    expect(result.finishReason).toEqual({ unified: 'content-filter', raw: 'refusal' });
  });

  it.each([
    ['rate_limit', 429],
    ['timeout', 408],
    ['auth', 401],
    ['server', 500],
    ['overloaded', 529],
  ] as const)('CA-3 — erreur %s → APICallError de statut %i', async (kind, status) => {
    const model = createMockModel(errorFixture(kind));
    await expect(model.doGenerate({} as never)).rejects.toMatchObject({ statusCode: status });
  });

  it('CA-3 — contexte trop long → message et statut 400', async () => {
    const model = createMockModel(errorFixture('context_length'));
    await expect(model.doGenerate({} as never)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('too long') as unknown as string,
    });
  });

  it('CL-6 — au-delà de la dernière étape → MOCK_STEPS_EXHAUSTED', async () => {
    const model = createMockModel(fixtureNamed('demo'));
    await model.doGenerate({} as never);
    await expect(model.doGenerate({} as never)).rejects.toMatchObject({
      code: 'MOCK_STEPS_EXHAUSTED',
    });
  });

  it('ET-6 — les marqueurs sont retirés du texte transmis', async () => {
    const fixture = parseFixture({
      task: 'tutor',
      scenario: 'marker',
      promptId: 'tutor.demo',
      promptVersion: 1,
      description: 'marker',
      steps: [{ type: 'text', text: 'avant [[mock:demo]] après' }],
    });
    const result = (await createMockModel(fixture).doGenerate({} as never)) as {
      content: { text?: string }[];
    };
    expect(result.content[0]?.text).toBe('avant  après');
  });

  it('ET-6 — une fixture absente produit AppError MOCK_FIXTURE_NOT_FOUND', () => {
    expect(new AppError('MOCK_FIXTURE_NOT_FOUND', 'x').code).toBe('MOCK_FIXTURE_NOT_FOUND');
  });
});
