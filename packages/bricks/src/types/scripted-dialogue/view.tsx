'use client';

import { resolveLabels } from '../../view/labels';
import type { BrickViewProps } from '../../view-types';

const ROWS = ['role', 'context', 'goal', 'end', 'opening'] as const;

/** Reading sheet of the scripted dialogue; no interactive game in V1 (SPEC-503 EF-15, ADR-0074). */
export function ScriptedDialogueView({ brick, labels }: BrickViewProps<'scripted_dialogue'>) {
  const t = resolveLabels(labels);
  const payload = brick.publicPayload;
  const values: Record<(typeof ROWS)[number], string> = {
    role: payload.role,
    context: payload.context,
    goal: payload.learnerGoal,
    end: t.dialogueEndValue,
    opening: payload.openingLine,
  };
  const rowLabels: Record<(typeof ROWS)[number], string> = {
    role: t.dialogueRole,
    context: t.dialogueContext,
    goal: t.dialogueGoal,
    end: t.dialogueEnd,
    opening: t.dialogueOpening,
  };

  return (
    <section className="flex flex-col gap-12 text-ink" data-testid="brick-scripted_dialogue">
      <h2 className="m-0 font-display text-24 font-600">{payload.role}</h2>
      <dl className="m-0 grid grid-cols-1 gap-10">
        {ROWS.map((row) => (
          <div className="flex flex-col gap-2" key={row}>
            <dt className="text-12 font-700 tracking-eyebrow text-ink-muted uppercase">
              {rowLabels[row]}
            </dt>
            <dd className="m-0 text-15 leading-1.55 text-ink-secondary">{values[row]}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-12 text-ink-muted">{t.dialogueTurns(payload.maxTurns)}</p>
    </section>
  );
}
