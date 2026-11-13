// Unit tests of the qualification battery (SPEC-506 CA-1 to CA-3, EF-1 to EF-3, CL-2, CL-3).
// The session replays committed fixtures; the brick adapter is a fake. The real thirteen schemas
// are exercised by `packages/services/test/integration/qualify-model.test.ts`.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { QualificationReport, type QualificationIssue } from '@learny/contracts';
import { AppError, ok, type Clock, type Result } from '@learny/core';

import type { FixtureFile, FixtureStep } from '../mock/fixture-schema';
import { emptyUsage, type StepInput, type StepOutput } from '../types';

import {
  evaluateQualification,
  QUALIFICATION_FIXTURES,
  type QualificationBrickBattery,
  type QualificationSession,
} from './index';

const FIXED = new Date('2026-11-11T12:20:00Z');
const MODEL = 'gpt-qualification-demo';
const CREDENTIAL = '11111111-1111-4111-8111-111111111111';
const TYPES = [
  'text',
  'resource_excerpt',
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
  'instruction',
  'scripted_dialogue',
  'timer',
  'scoring',
] as const;

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

function fixtureOf(scenario: string): FixtureFile {
  const found = QUALIFICATION_FIXTURES.find((entry) => entry.fixture.scenario === scenario);
  if (found === undefined) throw new Error(`fixture ${scenario} absente`);
  return found.fixture;
}

class FixtureSession implements QualificationSession {
  private index = 0;

  constructor(private readonly fixture: FixtureFile) {}

  step(): Promise<Result<StepOutput>> {
    const step = this.next();
    if (step.type === 'error') {
      const code =
        step.error.kind === 'timeout'
          ? 'AI_TIMEOUT'
          : step.error.kind === 'auth'
            ? 'AI_KEY_INVALID'
            : step.error.kind === 'rate_limit'
              ? 'AI_RATE_LIMITED'
              : 'AI_PROVIDER_ERROR';
      return Promise.resolve({ ok: false, error: new AppError(code, 'Échec simulé sûr.') });
    }
    return Promise.resolve(
      ok({
        text: step.type === 'text' ? step.text : '',
        toolCalls:
          step.type === 'tool-calls'
            ? step.toolCalls.map((call) => ({
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                input: call.input,
              }))
            : [],
        finishReason: step.type === 'tool-calls' ? 'tool-calls' : 'stop',
        usage: emptyUsage(),
        responseMessages: [],
        modelId: 'mock-light',
      }),
    );
  }

  object<S extends z.ZodType>(
    input: Omit<StepInput, 'tools'> & { schema: S },
  ): Promise<Result<z.infer<S>>> {
    const step = this.next();
    if (step.type !== 'object') {
      return Promise.resolve({
        ok: false,
        error: new AppError('INVALID_OUTPUT', 'Objet simulé absent.'),
      });
    }
    const parsed = input.schema.safeParse(step.object);
    if (!parsed.success) {
      return Promise.resolve({
        ok: false,
        error: new AppError('INVALID_OUTPUT', 'Objet simulé invalide.'),
      });
    }
    return Promise.resolve(ok(parsed.data));
  }

  private next(): FixtureStep {
    const step = this.fixture.steps[this.index];
    if (step === undefined) throw new Error('étapes de fixture épuisées');
    this.index += 1;
    return step;
  }
}

const battery: QualificationBrickBattery = {
  types: TYPES,
  schemaFor: () => z.record(z.string(), z.unknown()),
  promptFor: (type) => `Produis une brique ${type} valide.`,
  validate: (type, payload) => {
    if (type === 'open_question') {
      const value = payload as { criteria?: { points?: number }[] };
      const total = (value.criteria ?? []).reduce((sum, item) => sum + (item.points ?? 0), 0);
      if (total > 20) {
        const issues: QualificationIssue[] = [
          {
            code: 'CRITERIA_POINTS_MISMATCH',
            path: 'payload.criteria',
            message: 'Le total des points ne peut pas dépasser 20.',
          },
        ];
        return Promise.resolve({ ok: false, error: issues });
      }
    }
    return Promise.resolve({ ok: true, value: payload });
  },
};

async function evaluate(scenario: string) {
  return evaluateQualification({
    id: '22222222-2222-4222-8222-222222222222',
    credentialId: CREDENTIAL,
    modelId: MODEL,
    provider: 'openai',
    battery,
    clock: new TestClock(),
    session: new FixtureSession(fixtureOf(scenario)),
    mode: 'mock',
  });
}

describe('[SPEC-506] Qualification des modèles personnels', () => {
  it('CA-1 — la fixture complète qualifie après connexion, outil, structure et treize briques', async () => {
    const report = await evaluate('qualification-success');
    expect(QualificationReport.safeParse(report).success).toBe(true);
    expect(report.status).toBe('qualified');
    expect(report.modelId).toBe(MODEL);
    expect(report.steps.map((step) => step.step)).toEqual([
      'connection',
      'tools',
      'structured',
      'bricks',
    ]);
    expect(report.steps.every((step) => step.status === 'passed')).toBe(true);
    expect(report.steps.every((step) => step.durationMs >= 0)).toBe(true);
    expect(report.bricks).toHaveLength(13);
    expect(report.bricks.map((brick) => brick.type)).toEqual([...TYPES]);
    expect(report.bricks.every((brick) => brick.status === 'passed')).toBe(true);
    expect(report.capabilities).toMatchObject({
      tools: true,
      structured: true,
      web_search: true,
      passage_refs: true,
    });
    expect(report.startedAt).toBe('2026-11-11T12:20:00.000Z');
    expect(JSON.stringify(report)).not.toContain('sk-');
  });

  it('CA-2, CL-3 — une brique invalide échoue et conserve le détail des douze autres', async () => {
    const report = await evaluate('qualification-invalid-brick');
    expect(report.status).toBe('failed');
    const failed = report.bricks.filter((brick) => brick.status === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      type: 'open_question',
      status: 'failed',
      errorCode: 'INVALID_OUTPUT',
    });
    expect(failed[0]?.issues[0]?.code).toBe('CRITERIA_POINTS_MISMATCH');
    expect(report.bricks.filter((brick) => brick.status === 'passed')).toHaveLength(12);
    expect(report.steps.find((step) => step.step === 'bricks')?.status).toBe('failed');
    expect(report.capabilities.passage_refs).toBe(false);
  });

  it('CL-2 — fournisseur indisponible : aucun succès partiel déclaré', async () => {
    const report = await evaluate('qualification-connection-failure');
    expect(report.status).toBe('failed');
    expect(report.steps.find((step) => step.step === 'connection')).toMatchObject({
      status: 'failed',
      errorCode: 'AI_TIMEOUT',
    });
    expect(report.steps.filter((step) => step.status === 'passed')).toEqual([]);
    expect(report.bricks.every((brick) => brick.errorCode === 'NOT_RUN')).toBe(true);
    expect(report.capabilities).toEqual({
      tools: false,
      structured: false,
      web_search: false,
      passage_refs: false,
      vision: true,
    });
    expect(JSON.stringify(report)).not.toContain('apiKey');
  });

  it('CA-3 — une sortie structurée invalide porte un code sûr et arrête les briques', async () => {
    const session = new FixtureSession(fixtureOf('qualification-success'));
    const report = await evaluateQualification({
      id: '33333333-3333-4333-8333-333333333333',
      credentialId: CREDENTIAL,
      modelId: MODEL,
      provider: 'openai',
      battery,
      clock: new TestClock(),
      mode: 'mock',
      session: {
        step: session.step.bind(session),
        object: () =>
          Promise.resolve({
            ok: false as const,
            error: new AppError('INVALID_OUTPUT', 'Sortie non conforme.'),
          }),
      },
    });
    expect(report.status).toBe('failed');
    expect(report.steps.find((step) => step.step === 'structured')).toMatchObject({
      status: 'failed',
      errorCode: 'INVALID_OUTPUT',
    });
    expect(report.bricks.every((brick) => brick.errorCode === 'NOT_RUN')).toBe(true);
  });
});
