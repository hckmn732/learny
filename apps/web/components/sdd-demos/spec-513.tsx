'use client';

import { useState } from 'react';

import { brickFingerprint, stemText } from '@learny/bricks';
import { maskFingerprint, QuestionBankPrepareInput, QuestionBankResult } from '@learny/contracts';

import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec513;

const NOTION = '44444444-4444-4444-8444-444444444444';
const DISTRACTOR = '55555555-5555-4555-8555-555555555555';
const COURSE = '66666666-6666-4666-8666-666666666666';

interface DemoVariant {
  brickId: string;
  brickVersionId: string;
  fingerprint: string;
  stem: string;
  distractors: string[];
}

function choicePayload(stem: string, wrong: string): Record<string, unknown> {
  return {
    stem,
    mode: 'single',
    options: [
      { id: 'a', text: 'La réponse exacte', correct: true, notionId: NOTION },
      {
        id: 'b',
        text: wrong,
        correct: false,
        notionId: DISTRACTOR,
        rationale: 'Confusion fréquente.',
      },
      {
        id: 'c',
        text: 'Une autre confusion',
        correct: false,
        notionId: DISTRACTOR,
        rationale: 'À ne pas confondre.',
      },
    ],
    explanation: 'L’explication rappelle la règle et le raisonnement attendu.',
    objective: 'Vérifier la compréhension de la notion',
    sources: [],
  };
}

function variantsOf(suffix: string): DemoVariant[] {
  const stems = [
    `Quel compte augmente au débit ? (${suffix} 1)`,
    `Quelle écriture traduit l’encaissement ? (${suffix} 2)`,
    `Quel compte reçoit le crédit ? (${suffix} 3)`,
    `Pourquoi l’écriture reste-t-elle équilibrée ? (${suffix} 4)`,
  ];
  return stems.map((stem, index) => {
    const payload = choicePayload(stem, `Distracteur ${String(index + 1)}`);
    return {
      brickId: `77777777-7777-4777-8777-77777777777${String(index)}`,
      brickVersionId: `88888888-8888-4888-8888-88888888888${String(index)}`,
      fingerprint: brickFingerprint('choice_question', payload) ?? '',
      stem: stemText('choice_question', payload) ?? stem,
      distractors: ['Notion voisine — confusion fréquente', 'Notion voisine — à ne pas confondre'],
    };
  });
}

const INITIAL = variantsOf('initiale');
const REGENERATED = variantsOf('régénérée');

const INPUT = QuestionBankPrepareInput.parse({
  courseVersionId: COURSE,
  notionId: NOTION,
  formats: ['choice_question', 'open_question'],
  count: 4,
  reason: 'course_generated',
});

const OUTPUT = QuestionBankResult.parse({
  requestId: '99999999-9999-4999-8999-999999999999',
  courseVersionId: COURSE,
  reason: 'course_generated',
  groups: [
    {
      notionId: NOTION,
      format: 'choice_question',
      required: 4,
      available: 4,
      inserted: 4,
      duplicates: 0,
      complete: true,
    },
  ],
  variants: INITIAL.map((variant) => ({
    brickId: variant.brickId,
    brickVersionId: variant.brickVersionId,
    notionId: NOTION,
    format: 'choice_question' as const,
    fingerprint: variant.fingerprint,
    stem: variant.stem,
    status: 'active' as const,
    distractors: [
      {
        notionId: DISTRACTOR,
        label: 'Notion voisine',
        rationale: 'Confusion fréquente.',
      },
    ],
  })),
  complete: true,
});

function VariantRows({ variants }: Readonly<{ variants: DemoVariant[] }>) {
  return (
    <div
      role="region"
      aria-label={t.variants.title}
      tabIndex={0}
      className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <table className="w-full min-w-[44rem] text-left text-13">
        <thead>
          <tr className="border-b border-solid border-border">
            <th scope="col" className="px-2 py-2">
              {t.variants.format}
            </th>
            <th scope="col" className="px-2 py-2">
              {t.variants.stem}
            </th>
            <th scope="col" className="px-2 py-2">
              {t.variants.fingerprint}
            </th>
            <th scope="col" className="px-2 py-2">
              {t.variants.distractors}
            </th>
            <th scope="col" className="px-2 py-2">
              {t.variants.status}
            </th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant, index) => (
            <tr
              key={variant.brickId}
              data-testid={`spec-513-variant-${String(index)}`}
              className="border-b border-solid border-border"
            >
              <td className="px-2 py-2">{t.formats.choice_question}</td>
              <td className="px-2 py-2">{variant.stem}</td>
              <td
                className="px-2 py-2 font-mono"
                data-testid={`spec-513-fingerprint-${String(index)}`}
              >
                {maskFingerprint(variant.fingerprint)}
              </td>
              <td className="px-2 py-2">
                <ul className="m-0 list-none p-0">
                  {variant.distractors.map((distractor) => (
                    <li key={distractor}>{distractor}</li>
                  ))}
                </ul>
              </td>
              <td className="px-2 py-2">{t.status.active}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Spec513Demo() {
  const [state, setState] = useState<'initial' | 'exhausted' | 'regenerated'>('initial');
  const variants = state === 'regenerated' ? REGENERATED : INITIAL;
  const seen = state === 'initial' ? 0 : 4;
  const exhausted = state !== 'initial';

  return (
    <>
      <BaseTokenStyle />
      <p className="mt-6 text-sm">{t.intro}</p>

      <BaseCard testId="spec-513-notion-card" title={t.notion.title}>
        <dl className="m-0 grid grid-cols-1 gap-2 text-13 sm:grid-cols-[12rem_1fr]">
          <dt className="text-ink-muted">{t.notion.notion}</dt>
          <dd className="m-0" data-testid="spec-513-notion-label">
            {t.notion.label}
          </dd>
          <dt className="text-ink-muted">{t.notion.course}</dt>
          <dd className="m-0 font-mono" data-testid="spec-513-course-version">
            {t.notion.version}
          </dd>
          <dt className="text-ink-muted">{t.notion.formats}</dt>
          <dd className="m-0">{t.notion.formatLabels}</dd>
        </dl>
        <p className="mt-3 text-12 text-ink-muted">{t.notion.note}</p>
      </BaseCard>

      <BaseCard testId="spec-513-variants-card" title={t.variants.title}>
        <p className="mt-0 text-13 text-ink-muted" data-testid="spec-513-counter">
          {t.variants.counter(seen, variants.length, variants.length)}
        </p>
        <VariantRows variants={variants} />
        <p className="mt-3 text-12 text-ink-muted">{t.variants.note}</p>
      </BaseCard>

      <BaseCard testId="spec-513-exhaustion-card" title={t.exhaustion.title}>
        <p className="mt-0 text-13" data-testid="spec-513-exhaustion-state">
          {exhausted ? t.exhaustion.exhausted : t.exhaustion.available}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="spec-513-mark-exhausted"
            className="rounded-12 bg-green px-4 py-2 text-13 font-semibold text-ink"
            onClick={() => {
              setState('exhausted');
            }}
          >
            {t.exhaustion.markSeen}
          </button>
          <button
            type="button"
            data-testid="spec-513-regenerate"
            className="rounded-12 border border-solid border-border bg-surface px-4 py-2 text-13 font-semibold text-ink"
            onClick={() => {
              setState('regenerated');
            }}
          >
            {t.exhaustion.regenerate}
          </button>
        </div>
        {state === 'regenerated' ? (
          <p className="mt-3 text-13" data-testid="spec-513-regeneration">
            {t.exhaustion.regenerated}
          </p>
        ) : null}
        <p className="mt-3 text-12 text-ink-muted">{t.exhaustion.note}</p>
      </BaseCard>

      <BaseCard testId="spec-513-contract-card" title={t.contract.title}>
        <dl className="m-0 grid grid-cols-1 gap-3 text-13">
          <div>
            <dt className="font-semibold">{t.contract.input}</dt>
            <dd
              className="m-0 mt-1 overflow-x-auto font-mono text-12"
              data-testid="spec-513-contract-input"
            >
              {JSON.stringify(INPUT, null, 2)}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">{t.contract.output}</dt>
            <dd
              className="m-0 mt-1 overflow-x-auto font-mono text-12"
              data-testid="spec-513-contract-output"
            >
              {JSON.stringify(
                { ...OUTPUT, variants: `${String(OUTPUT.variants.length)} variantes` },
                null,
                2,
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-12 text-ink-muted">{t.contract.note}</p>
      </BaseCard>

      <BaseCard testId="spec-513-failure-card" title={t.failure.title} role="status">
        <p className="m-0 text-13">{t.failure.body}</p>
        <p className="mt-2 m-0 font-mono text-13" data-testid="spec-513-failure-code">
          COURSE_NOT_READY
        </p>
        <p className="mt-1 m-0 text-13 text-ink-muted" data-testid="spec-513-failure-message">
          {t.failure.message}
        </p>
      </BaseCard>
    </>
  );
}
