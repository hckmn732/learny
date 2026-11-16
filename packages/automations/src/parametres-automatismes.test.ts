import { describe, expect, it } from 'vitest';

import {
  AUTOMATION_DISPLAY_DEFINITIONS,
  AUTOMATION_GROUPS,
  AUTOMATION_PAUSE_KEY,
  AUTOMATION_PARAM_SCHEMAS,
  automationDisplayDefinition,
  type AutomationActionItem,
} from '@learny/contracts';

import type { AutomationJournalPage, AutomationSettingsValue } from './moteur-d-automatismes';
import {
  automationParamsWithField,
  automationSettingValues,
  buildAutomationSettingsView,
  sortAutomationActions,
  visibleAutomationSettings,
  weekAutomationJournal,
} from './parametres-automatismes';

const AT = '2026-11-11T12:20:00.000Z';

function action(
  id: string,
  automation: AutomationActionItem['automation'],
  createdAt: string,
  status: AutomationActionItem['status'] = 'applied',
): AutomationActionItem {
  return {
    id,
    automation,
    kind: `${automation}_demo`,
    summary: `Action ${id}`,
    formationId: null,
    payload: { dedupeKey: id },
    undoPayload: status === 'applied' ? { restore: true } : null,
    requiresConsent: false,
    status,
    decidedAt: null,
    createdAt,
  };
}

function settings(
  enabled: Partial<Record<AutomationActionItem['automation'], boolean>> = {},
): AutomationSettingsValue {
  return {
    paused: false,
    items: AUTOMATION_DISPLAY_DEFINITIONS.map((definition) => ({
      automation: definition.key,
      enabled: enabled[definition.key] ?? true,
      params: {},
      updatedAt: AT,
    })),
  };
}

function page(items: AutomationActionItem[], weekCount = items.length): AutomationJournalPage {
  return { items, weekCount, nextCursor: null };
}

describe('[SPEC-710] règles et calculs', () => {
  it('CA-1 — les dix automatismes apparaissent exactement une fois dans les groupes et la carte pause', () => {
    const keys = AUTOMATION_DISPLAY_DEFINITIONS.map((definition) => definition.key);
    expect(keys).toHaveLength(10);
    expect(new Set(keys).size).toBe(10);
    expect(AUTOMATION_GROUPS.map((group) => group.keys)).toEqual([
      ['reprise', 'micro_seance', 'bilan'],
      ['echauffement', 'questions_cartes', 'plafond_quiz'],
      ['remediation', 'jeu_lacune', 'sprint'],
    ]);
    expect(AUTOMATION_GROUPS.flatMap((group) => group.keys)).toHaveLength(9);
    expect(keys.filter((key) => key === AUTOMATION_PAUSE_KEY)).toHaveLength(1);
    for (const key of keys) {
      const definition = automationDisplayDefinition(key);
      expect(definition).toBeDefined();
      expect(definition?.key).toBe(key);
    }
  });

  it('CA-1 — chaque réglage propose de vraies options et son défaut est valide', () => {
    for (const definition of AUTOMATION_DISPLAY_DEFINITIONS) {
      expect(definition.settings.length).toBeGreaterThan(0);
      for (const field of definition.settings) {
        if (field.type === 'switch') {
          expect(['true', 'false']).toContain(field.defaultValue);
          continue;
        }
        if (field.optionsSource === 'pauseDates') continue;
        expect(field.options.length).toBeGreaterThan(0);
        expect(field.options).toContain(field.defaultValue);
      }
      const parsed = AUTOMATION_PARAM_SCHEMAS[definition.key].safeParse({});
      expect(parsed.success).toBe(true);
    }
  });

  it('CA-1 — un automatisme désactivé n’expose aucun réglage éditable et ses valeurs restent canoniques', () => {
    const definition = automationDisplayDefinition('micro_seance');
    if (definition === undefined) throw new Error('définition absente');
    expect(visibleAutomationSettings(definition, false)).toEqual([]);
    expect(visibleAutomationSettings(definition, true)).toHaveLength(2);
    const values = automationSettingValues(definition, { hour: 21, durationMin: 5 });
    expect(values).toEqual({ hour: '21', durationMin: '5' });
    expect(automationSettingValues(definition, {})).toEqual({ hour: '20', durationMin: '5' });
  });

  it('CA-1, CL-4 — un champ select est reconverti vers le type stocké sans toucher aux autres', () => {
    const definition = automationDisplayDefinition('plafond_quiz');
    if (definition === undefined) throw new Error('définition absente');
    const number = definition.settings[0];
    const string = definition.settings[1];
    if (number === undefined || string === undefined) throw new Error('champs absents');
    expect(automationParamsWithField({ maxMinutes: 15 }, number, '30')).toEqual({ maxMinutes: 30 });
    expect(automationParamsWithField({ targetRetention: 0.9 }, string, '0.95')).toEqual({
      targetRetention: 0.95,
    });
    const pause = automationDisplayDefinition('pause');
    const diagnostic = pause?.settings.find((field) => field.param === 'diagnosticOnReturn');
    if (diagnostic === undefined) throw new Error('champ diagnostic absent');
    expect(automationParamsWithField({}, diagnostic, 'false')).toEqual({
      diagnosticOnReturn: false,
    });
  });

  it('CA-2 — le compteur hebdomadaire correspond exactement aux lignes du journal', () => {
    const items = [
      action('11111111-1111-4111-8111-111111111111', 'reprise', '2026-11-11T09:00:00.000Z'),
      action('22222222-2222-4222-8222-222222222222', 'sprint', '2026-11-11T08:00:00.000Z'),
      action('33333333-3333-4333-8333-333333333333', 'bilan', '2026-11-10T19:00:00.000Z'),
      action('44444444-4444-4444-8444-444444444444', 'reprise', '2026-11-08T09:00:00.000Z'),
    ];
    const view = buildAutomationSettingsView(settings(), page(items, 3));
    expect(view.weeklyCount).toBe(3);
    expect(view.journal).toHaveLength(3);
    expect(view.journal.map((entry) => entry.id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(weekAutomationJournal(items, 0)).toEqual([]);
    expect(weekAutomationJournal(items, 10)).toHaveLength(4);
  });

  it('CA-2 — la dernière action est datée, la plus récente d’abord, et le tri est stable', () => {
    const items = [
      action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'reprise', '2026-11-11T10:00:00.000Z'),
      action('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'reprise', '2026-11-11T10:00:00.000Z'),
      action('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'reprise', '2026-11-10T10:00:00.000Z'),
    ];
    expect(sortAutomationActions(items).map((entry) => entry.id)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ]);
    const view = buildAutomationSettingsView(settings(), page(items, 3));
    const reprise = view.groups
      .flatMap((group) => group.items)
      .find((item) => item.key === 'reprise');
    expect(reprise?.lastAction).toEqual({
      at: '2026-11-11T10:00:00.000Z',
      summary: 'Action aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'applied',
    });
  });

  it('CA-2 — l’état de l’action décide de l’annulation offerte', () => {
    const items = [
      action('11111111-1111-4111-8111-111111111111', 'reprise', AT, 'applied'),
      action('22222222-2222-4222-8222-222222222222', 'echauffement', AT, 'consumed'),
      action('33333333-3333-4333-8333-333333333333', 'sprint', AT, 'undone'),
    ];
    const view = buildAutomationSettingsView(settings(), page(items, 3));
    expect(view.journal.map((entry) => entry.status)).toEqual(['applied', 'consumed', 'undone']);
    // L'interface n'affiche « Annuler » que sur `applied` (l'action consommée garde son état).
    expect(view.journal.filter((entry) => entry.status === 'applied')).toHaveLength(1);
    const states = view.journal.map((entry) => entry.status);
    expect(states).not.toContain('pending_consent');
  });

  it('CA-1 — le compteur d’actifs ne compte que les neuf automatismes des groupes', () => {
    const view = buildAutomationSettingsView(
      settings({ reprise: false, sprint: false }),
      page([], 0),
    );
    expect(view.totalCount).toBe(9);
    expect(view.activeCount).toBe(7);
    expect(view.groups).toHaveLength(3);
    expect(view.groups.flatMap((group) => group.items)).toHaveLength(9);
    expect(view.journal).toEqual([]);
    expect(view.weeklyCount).toBe(0);
  });
});
