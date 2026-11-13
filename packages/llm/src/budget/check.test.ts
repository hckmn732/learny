import { describe, expect, it } from 'vitest';

import { AI_MODEL_IDS } from '@learny/config';

import {
  budgetPercent,
  calculateUsageCost,
  checkBudget,
  estimateUsageCost,
  formatUsdMicros,
  parseUsdMicros,
  shouldAlert,
} from './index';

const AT = new Date('2026-11-11T12:20:00Z');
const USER = '11111111-1111-4111-8111-111111111111';
const CAP = '1.50';

function budget(overrides: Partial<Parameters<typeof checkBudget>[0]> = {}) {
  return checkBudget({
    userId: USER,
    task: 'tutor',
    model: AI_MODEL_IDS.sonnet,
    estimatedTokens: { inputTokens: 4_000, outputTokens: 1_000 },
    at: AT,
    capUsd: CAP,
    spentUsd: '0',
    ...overrides,
  });
}

describe('[SPEC-507] Garde-fou de coût et journal des appels', () => {
  it('CA-1 — 1,20 USD sur 1,50 déclenche une alerte à 80 % sans bloquer l’appel', () => {
    const result = budget({ spentUsd: '1.20' });
    expect(result.decision).toBe('allow');
    expect(result.model).toBe(AI_MODEL_IDS.sonnet);
    expect(result.percentUsed).toBe(80);
    expect(result.alert).toBe(true);
    expect(result.reason).toBe('alert_threshold');
    expect(result.alertThresholdPercent).toBe(80);
    expect(shouldAlert('1.20', CAP)).toBe(true);
    expect(budgetPercent('1.20', CAP)).toBe(80);
  });

  it('CA-1 — 1,199 reste sous le seuil de 80 %', () => {
    const result = budget({ spentUsd: '1.199' });
    expect(result.alert).toBe(false);
    expect(result.percentUsed).toBe(79.93);
    expect(shouldAlert('1.199', CAP)).toBe(false);
  });

  it('CA-2 — au plafond, le tuteur bascule sur Haiku et le programme est reporté', () => {
    const tutor = budget({ spentUsd: CAP });
    expect(tutor.decision).toBe('downgrade');
    expect(tutor.model).toBe(AI_MODEL_IDS.haiku);
    expect(tutor.reason).toBe('cap_downgrade');
    expect(tutor.defer).toBe(false);

    const programme = budget({ task: 'programme', model: AI_MODEL_IDS.opus, spentUsd: CAP });
    expect(programme.decision).toBe('defer');
    expect(programme.defer).toBe(true);
    expect(programme.reason).toBe('cap_deferred');
    expect(programme.model).toBe(AI_MODEL_IDS.opus);

    const course = budget({ task: 'course', model: AI_MODEL_IDS.opus, spentUsd: '1.49' });
    expect(course.decision).toBe('downgrade');
    expect(course.model).toBe(AI_MODEL_IDS.haiku);
  });

  it('CA-2 — une tâche déjà sur Haiku continue jusqu’au minuit local', () => {
    const result = budget({ task: 'light', model: AI_MODEL_IDS.haiku, spentUsd: '1.8' });
    expect(result.decision).toBe('allow');
    expect(result.model).toBe(AI_MODEL_IDS.haiku);
    expect(result.reason).toBe('already_light');
    expect(result.defer).toBe(false);
  });

  it('CL-1 — un appel à cheval sur le plafond est décidé avant l’appel', () => {
    // 1.49 + 0.036 (Opus 4k/1k) dépasse 1.50 : le programme est reporté, pas dégradé.
    const programme = budget({
      task: 'programme',
      model: AI_MODEL_IDS.opus,
      spentUsd: '1.49',
    });
    expect(programme.decision).toBe('defer');
    expect(programme.estimatedCostUsd).toBe('0.036000');

    // 1.49 + 0.018 (Sonnet 4k/1k) dépasse aussi le plafond : le tuteur passe sur Haiku.
    const tutor = budget({ spentUsd: '1.49' });
    expect(tutor.decision).toBe('downgrade');
    expect(tutor.estimatedCostUsd).toBe('0.018000');

    // 1.48 + 0.018 reste sous le plafond : aucune bascule.
    const under = budget({ spentUsd: '1.48' });
    expect(under.decision).toBe('allow');
    expect(under.model).toBe(AI_MODEL_IDS.sonnet);
  });

  it('CL-3 — une clé personnelle ne consomme pas le plafond et n’invente pas de coût', () => {
    const result = budget({ managed: false, model: 'gpt-personnel', spentUsd: '1.50' });
    expect(result.decision).toBe('allow');
    expect(result.reason).toBe('personal_key');
    expect(result.model).toBe('gpt-personnel');
    expect(result.alert).toBe(false);
    expect(result.percentUsed).toBe(0);
    expect(result.estimatedCostUsd).toBe('0.000000');
    expect(result.priced).toBe(false);
  });

  it('ET-2 — un modèle fourni inconnu ne reçoit jamais un tarif inventé', () => {
    const result = budget({ model: 'claude-modele-inconnu' });
    expect(result.decision).toBe('defer');
    expect(result.reason).toBe('price_unavailable');
    expect(result.priced).toBe(false);
    expect(result.estimatedCostUsd).toBe('0.000000');
  });

  it('ET-1 — la décision est pure et déterministe', () => {
    const input = {
      userId: USER,
      task: 'tutor' as const,
      model: AI_MODEL_IDS.sonnet,
      estimatedTokens: { inputTokens: 4_000, outputTokens: 1_000 },
      at: AT,
      capUsd: CAP,
      spentUsd: '1.20',
    };
    const first = checkBudget(input);
    const second = checkBudget(input);
    expect(second).toEqual(first);
    expect(input).toEqual({
      userId: USER,
      task: 'tutor',
      model: AI_MODEL_IDS.sonnet,
      estimatedTokens: { inputTokens: 4_000, outputTokens: 1_000 },
      at: AT,
      capUsd: CAP,
      spentUsd: '1.20',
    });
  });

  it('ET-4 — les entrées invalides sont refusées par Zod', () => {
    expect(() => budget({ estimatedTokens: { inputTokens: -1, outputTokens: 0 } })).toThrow();
    expect(() => budget({ capUsd: '0' })).toThrow();
    expect(() => budget({ spentUsd: '-1' })).toThrow();
    expect(() =>
      checkBudget({
        userId: 'pas-un-uuid',
        task: 'tutor',
        model: AI_MODEL_IDS.sonnet,
        estimatedTokens: { inputTokens: 1, outputTokens: 1 },
        at: AT,
        capUsd: CAP,
        spentUsd: '0',
      }),
    ).toThrow();
  });

  it('ET-2 — les tarifs suivent ADR-0073, cache et lots compris', () => {
    const opus = calculateUsageCost({
      model: AI_MODEL_IDS.opus,
      managed: true,
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
      },
    });
    expect(opus.priced).toBe(true);
    // 4 + 20 + 0.20 (5 %) + 5 (125 %).
    expect(opus.costUsd).toBe('29.200000');

    const haiku = estimateUsageCost({
      model: AI_MODEL_IDS.haiku,
      managed: true,
      inputTokens: 4_000,
      outputTokens: 1_000,
    });
    expect(haiku.costUsd).toBe('0.000900');

    const batch = calculateUsageCost({
      model: AI_MODEL_IDS.opus,
      managed: true,
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      batch: true,
    });
    expect(batch.costUsd).toBe('12.000000');

    const personal = calculateUsageCost({
      model: 'gpt-personnel',
      managed: false,
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });
    expect(personal).toEqual({ costUsd: '0.000000', priced: false });
  });

  it('ET-2 — les montants sont arrondis au millionième sans dérive flottante', () => {
    expect(formatUsdMicros(0)).toBe('0.000000');
    expect(formatUsdMicros(48)).toBe('0.000048');
    expect(formatUsdMicros(1_500_000)).toBe('1.500000');
    expect(parseUsdMicros('1.500000')).toBe(1_500_000);
    expect(parseUsdMicros(0.1)).toBe(100_000);
  });
});
