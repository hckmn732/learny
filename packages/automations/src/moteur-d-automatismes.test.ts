// Unit tests of the automation engine (SPEC-711 §12, CA-1, CA-2, ET-3).
//
// Pure tests: the registry, the one-line explanation, the draft validation and the start of the
// learner's local week. Nothing touches Postgres here; the transactions, RLS, row locks and the
// real `on conflict do nothing` of the partial unique index are pinned by the integration and
// route suites. The clock is fixed at 2026-11-11T12:20:00Z (ADR-0047), never read from the process.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { EVENT_AUTOMATION_KEYS } from '@learny/contracts';
import { AppError } from '@learny/core';

import {
  AutomationRegistry,
  createAutomationRegistry,
  defineAutomation,
  startOfUserWeek,
  validateDraft,
  type AutomationActionDraft,
  type AutomationActionView,
  type AutomationDefinition,
} from './moteur-d-automatismes';

const AT = new Date('2026-11-11T12:20:00Z');

function actionView(overrides: Partial<AutomationActionView> = {}): AutomationActionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    automation: 'reprise',
    kind: 'reprise_demo',
    summary: '',
    formationId: null,
    payload: {},
    undoPayload: null,
    requiresConsent: true,
    status: 'pending_consent',
    decidedAt: null,
    createdAt: '2026-11-11T12:20:00.000Z',
    ...overrides,
  };
}

function definitionFor(
  key: (typeof EVENT_AUTOMATION_KEYS)[number],
): AutomationDefinition<z.ZodType> {
  return defineAutomation({
    key,
    triggers: [{ type: 'event', name: 'formation/resumed' }],
    params: z.object({}).default({}),
    run: () => Promise.resolve([]),
    explain: (action, tone) =>
      tone === 'tu'
        ? `Résumé de ${action.automation} (tu)`
        : `Résumé de ${action.automation} (vous)`,
  });
}

function draft(overrides: Partial<AutomationActionDraft> = {}): AutomationActionDraft {
  return {
    kind: 'reprise_demo',
    formationId: null,
    requiresConsent: true,
    payload: { minutes: 15 },
    undoPayload: null,
    dedupeKey: 'reprise:2026-11-11',
    ...overrides,
  };
}

function expectValidationFailure(fn: () => unknown, path: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  const error = caught as AppError;
  expect(error.code).toBe('VALIDATION_FAILED');
  expect(error.errors?.[0]?.path).toBe(path);
}

describe('[SPEC-711] règles et calculs', () => {
  it('CA-1 — les dix clés sont uniques et le registre accepte une définition pour chacune', () => {
    expect(new Set(EVENT_AUTOMATION_KEYS).size).toBe(10);
    const registry = createAutomationRegistry();
    for (const key of EVENT_AUTOMATION_KEYS) {
      registry.register(definitionFor(key));
    }
    expect(registry.size).toBe(10);
    expect(registry.keys()).toEqual([...EVENT_AUTOMATION_KEYS]);
    // Ordre déterministe : l'ordre d'enregistrement, jamais celui d'un `Map` implicite.
    expect(registry.keys()).toHaveLength(10);
  });

  it('CA-1 — chaque définition acceptée expose schéma, déclencheurs et explication d’une ligne', () => {
    const registry = createAutomationRegistry();
    for (const key of EVENT_AUTOMATION_KEYS) registry.register(definitionFor(key));
    for (const key of EVENT_AUTOMATION_KEYS) {
      const definition = registry.require(key);
      expect(definition.params.safeParse({}).success).toBe(true);
      expect(definition.triggers.length).toBeGreaterThan(0);
      const summary = definition.explain(actionView(), 'vous', 'Europe/Paris');
      expect(summary.length).toBeGreaterThan(0);
      expect(summary.length).toBeLessThanOrEqual(160);
      expect(summary).not.toContain('\n');
    }
  });

  it('CA-1 — le registre refuse deux définitions du même identifiant', () => {
    const registry = createAutomationRegistry();
    registry.register(definitionFor('reprise'));
    let caught: unknown;
    try {
      registry.register(definitionFor('reprise'));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe('CONFLICT');
    expect(registry.size).toBe(1);
    registry.register(definitionFor('bilan'));
    expect(registry.size).toBe(2);
  });

  it('CA-1 — une clé hors énumération est refusée et une clé sans définition est introuvable', () => {
    const registry = new AutomationRegistry();
    let caught: unknown;
    try {
      registry.register({ ...definitionFor('reprise'), key: 'inconnu' as never });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe('VALIDATION_FAILED');

    let missing: unknown;
    try {
      registry.require('pause');
    } catch (error) {
      missing = error;
    }
    expect(missing).toBeInstanceOf(AppError);
    expect((missing as AppError).code).toBe('NOT_FOUND');
    expect(registry.get('pause')).toBeUndefined();
  });

  it('CA-2 — la déduplication est portée par la clé du brouillon, jamais par l’appelant', () => {
    const definition = definitionFor('reprise');
    const { payload } = validateDraft(definition, draft(), 'vous', 'Europe/Paris');
    expect(payload.dedupeKey).toBe('reprise:2026-11-11');
    expect(payload.minutes).toBe(15);
    // La notification et l'échéance ne polluent pas le payload métier.
    const expiring = validateDraft(
      definition,
      draft({
        expiresAt: '2026-11-12T09:00:00+01:00',
        notification: { type: 'relaunch', href: '/aujourdhui' },
      }),
      'vous',
      'Europe/Paris',
    );
    expect(expiring.payload.expiresAt).toBe('2026-11-12T08:00:00.000Z');
    expect(expiring.payload.notification).toBeUndefined();
  });

  it('CL-1 — une clé vide, trop longue ou un type d’action hors schéma sont refusés', () => {
    const definition = definitionFor('reprise');
    expectValidationFailure(
      () => validateDraft(definition, draft({ dedupeKey: '' }), 'vous', 'Europe/Paris'),
      'dedupeKey',
    );
    expectValidationFailure(
      () =>
        validateDraft(definition, draft({ dedupeKey: 'x'.repeat(201) }), 'vous', 'Europe/Paris'),
      'dedupeKey',
    );
    expectValidationFailure(
      () => validateDraft(definition, draft({ dedupeKey: '   ' }), 'vous', 'Europe/Paris'),
      'dedupeKey',
    );
    expectValidationFailure(
      () => validateDraft(definition, draft({ kind: 'Reprise' }), 'vous', 'Europe/Paris'),
      'kind',
    );
    expectValidationFailure(
      () => validateDraft(definition, draft({ kind: '' }), 'vous', 'Europe/Paris'),
      'kind',
    );
  });

  it('CL-1 — une explication vide, multiligne ou de plus de 160 caractères est refusée', () => {
    const tooLong = defineAutomation({
      ...definitionFor('reprise'),
      explain: () => 'a'.repeat(161),
    });
    expectValidationFailure(
      () => validateDraft(tooLong, draft(), 'vous', 'Europe/Paris'),
      'summary',
    );
    const multiline = defineAutomation({
      ...definitionFor('reprise'),
      explain: () => 'deux\nlignes',
    });
    expectValidationFailure(
      () => validateDraft(multiline, draft(), 'vous', 'Europe/Paris'),
      'summary',
    );
    const empty = defineAutomation({ ...definitionFor('reprise'), explain: () => '   ' });
    expectValidationFailure(() => validateDraft(empty, draft(), 'vous', 'Europe/Paris'), 'summary');
  });

  it('CL-1 — une échéance ou un lien de notification invalides sont refusés', () => {
    const definition = definitionFor('reprise');
    expectValidationFailure(
      () => validateDraft(definition, draft({ expiresAt: 'demain' }), 'vous', 'Europe/Paris'),
      'expiresAt',
    );
    expectValidationFailure(
      () =>
        validateDraft(
          definition,
          draft({ notification: { type: 'relaunch', href: 'https://example.com' } }),
          'vous',
          'Europe/Paris',
        ),
      'notification.href',
    );
  });

  it('BR-AUT-12 — la semaine locale commence le lundi 00:00 dans le fuseau du profil', () => {
    // Mercredi 11 novembre 2026, 12:20 UTC : lundi 9 novembre 00:00 à Paris (UTC+1).
    expect(startOfUserWeek(AT, 'Europe/Paris').toISOString()).toBe('2026-11-08T23:00:00.000Z');
    // Le même instant à UTC reste lundi 9 novembre 00:00 UTC.
    expect(startOfUserWeek(AT, 'UTC').toISOString()).toBe('2026-11-09T00:00:00.000Z');
    // Auckland est déjà jeudi 12 novembre (UTC+13) : la semaine commence le lundi 9 local.
    expect(startOfUserWeek(AT, 'Pacific/Auckland').toISOString()).toBe('2026-11-08T11:00:00.000Z');
    // Dimanche 23:30 à Paris appartient encore à la semaine du lundi précédent.
    expect(startOfUserWeek('2026-11-15T22:30:00Z', 'Europe/Paris').toISOString()).toBe(
      '2026-11-08T23:00:00.000Z',
    );
    // Lundi 00:30 à Paris : même début de semaine, calcul stable autour de minuit.
    expect(startOfUserWeek('2026-11-08T23:30:00Z', 'Europe/Paris').toISOString()).toBe(
      '2026-11-08T23:00:00.000Z',
    );
  });
});
