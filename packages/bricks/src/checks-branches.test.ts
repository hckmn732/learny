import { describe, expect, it } from 'vitest';

import { brickExamples } from './examples';
import { instructionChecks } from './types/instruction/checks';
import type { InstructionPayload } from './types/instruction/schema';
import { timerChecks } from './types/timer/checks';

function table(overrides: Record<string, unknown>) {
  const valid = brickExamples.instruction.valid;
  const production = valid.production as Extract<
    InstructionPayload['production'],
    { kind: 'table' }
  >;
  return { ...valid, production: { ...production, ...overrides } } as InstructionPayload;
}

describe('[SPEC-501] règles internes de la consigne (ET-4)', () => {
  it('accepte l’exemple de référence', () => {
    expect(instructionChecks(brickExamples.instruction.valid)).toEqual([]);
  });

  it('exige des options sur une colonne select', () => {
    const issues = instructionChecks(
      table({ columns: [{ key: 'sens', label: 'Sens', type: 'select' }], checks: [] }),
    );
    expect(issues.map((i) => [i.code, i.path])).toEqual([
      ['TABLE_OPTIONS_INVALID', 'payload.production.columns.0.options'],
    ]);
  });

  it('refuse des options hors colonne select', () => {
    const issues = instructionChecks(
      table({
        fields: [
          { key: 'libelle', label: 'Libellé', type: 'text', options: [{ value: 'a', label: 'A' }] },
        ],
      }),
    );
    expect(issues.map((i) => i.path)).toEqual(['payload.production.fields.0.options']);
  });

  it('refuse les valeurs d’option en double', () => {
    const issues = instructionChecks(
      table({
        columns: [
          { key: 'debit', label: 'Débit', type: 'number' },
          {
            key: 'sens',
            label: 'Sens',
            type: 'select',
            options: [
              { value: 'D', label: 'Débit' },
              { value: 'D', label: 'Doublon' },
            ],
          },
        ],
      }),
    );
    expect(issues.map((i) => i.path)).toEqual(['payload.production.columns.1.options.1.value']);
  });

  it('signale un contrôle de somme sur des colonnes inconnues ou non numériques', () => {
    const issues = instructionChecks(
      table({
        checks: [
          {
            type: 'sum_equal',
            numberColumn: 'sens',
            groupColumn: 'absent',
            left: ['D'],
            right: ['C'],
            leftLabel: 'D',
            rightLabel: 'C',
            sideColumnLabel: 'Sens',
          },
        ],
      }),
    );
    expect(issues.map((i) => [i.code, i.path])).toEqual([
      ['TABLE_CHECK_COLUMN_UNKNOWN', 'payload.production.checks.0.numberColumn'],
      ['TABLE_CHECK_COLUMN_UNKNOWN', 'payload.production.checks.0.groupColumn'],
    ]);
  });
});

describe('[SPEC-501] portée du minuteur (ET-4)', () => {
  it('interdit des identifiants d’items en portée activité', () => {
    const payload = { ...brickExamples.timer.valid, scope: 'activity' as const };
    expect(timerChecks(payload).map((i) => i.code)).toEqual(['TIMER_SCOPE_INVALID']);
  });

  it('accepte une portée activité sans items', () => {
    const payload = { ...brickExamples.timer.valid, scope: 'activity' as const, itemBrickIds: [] };
    expect(timerChecks(payload)).toEqual([]);
  });
});
