'use client';

import { useState } from 'react';

import type { BrickViewBrick } from '@learny/bricks/view';
import { ChoiceQuestionView, TimerView } from '@learny/bricks/view';
import { clock } from '@learny/core';

const BRICK: BrickViewBrick<'choice_question'> = {
  versionId: '00000000-0000-4000-8000-000000000503',
  type: 'choice_question',
  notionLabels: ['SAP Fiori'],
  publicPayload: {
    stem: 'Quelle interface donne accès aux applications de S/4HANA selon le rôle de l’utilisateur ?',
    mode: 'single',
    options: [
      { id: 'fiori', text: 'Le Launchpad SAP Fiori' },
      { id: 'gui', text: 'SAP GUI uniquement' },
      { id: 'sac', text: 'SAP Analytics Cloud' },
      { id: 'portail', text: 'Le portail client' },
    ],
    sources: [],
  },
};

const TIMER: BrickViewBrick<'timer'> = {
  versionId: '00000000-0000-4000-8000-000000000503',
  type: 'timer',
  notionLabels: [],
  publicPayload: {
    durationSec: 2400,
    scope: 'activity',
    itemBrickIds: [],
    warnAtSec: 300,
    autoSubmit: true,
    sources: [],
  },
};

const PALETTE = Array.from({ length: 20 }, (_, index) => index + 1);

export function ExamDemo() {
  const [value, setValue] = useState<{ optionIds: string[] } | null>(null);
  const fixed = clock.now();
  return (
    <div className="mx-auto flex w-full max-w-[72.5rem] flex-col gap-20">
      <div className="flex flex-wrap items-center gap-20 rounded-16 bg-ink px-20 py-12 text-white">
        <span className="font-display text-17 font-600">Examen blanc</span>
        <span className="text-14 text-on-dark-secondary">
          {value ? '1 répondue sur 20' : '0 répondue sur 20'}
        </span>
        <TimerView
          brick={TIMER}
          now={fixed}
          startedAt={fixed}
          status="idle"
          value={null}
          variant="exam"
        />
        <span className="ml-auto rounded-12 bg-white px-16 py-10 text-14 font-700 text-ink">
          Terminer l’examen
        </span>
      </div>
      <div className="flex flex-wrap items-start gap-20">
        <section
          aria-labelledby="exam-question"
          className="flex min-w-0 flex-[999_1_560px] flex-col gap-20 rounded-28 border border-solid border-border bg-surface p-32"
          data-testid="reproduction-examen"
        >
          <p className="m-0 text-13 font-700 tracking-eyebrow text-ink-muted uppercase">
            Question 1 sur 20
          </p>
          <ChoiceQuestionView
            brick={BRICK}
            labelledBy="exam-question"
            onChange={setValue}
            status={value ? 'answered' : 'idle'}
            value={value}
            variant="exam"
          />
          <div className="flex justify-between gap-10 border-t border-solid border-divider pt-8">
            <span className="rounded-12 border border-solid border-border-strong px-16 py-10 text-14 font-600 text-ink-muted">
              Précédente
            </span>
            <span className="rounded-12 bg-ink px-18 py-10 text-14 font-700 text-white">
              Suivante
            </span>
          </div>
        </section>
        <aside
          aria-label="Navigation dans l’examen"
          className="flex flex-[1_1_260px] flex-col gap-8 rounded-24 border border-solid border-border bg-surface p-18"
        >
          <div className="grid grid-cols-5 gap-8">
            {PALETTE.map((number) => (
              <span
                className={
                  number === 1
                    ? 'flex size-40 items-center justify-center rounded-10 border-2 border-solid border-lime bg-surface text-13 font-600'
                    : 'flex size-40 items-center justify-center rounded-10 border border-solid border-border text-13'
                }
                key={number}
              >
                {number}
              </span>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
