'use client';

import type { ReactNode } from 'react';

import { ENGINE } from '@learny/config/product';
import {
  drawAttempt,
  type DrawAttemptResult,
  type DrawBrick,
  type DrawGap,
  type DrawNotion,
} from '@learny/learning-engine';
import {
  SAP_GAPS_AT_REFERENCE,
  SAP_MASTERY_AT_REFERENCE,
  SAP_NOTIONS,
} from '@learny/learning-engine/fixtures';
import { Badge } from '@learny/ui';

import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const PARAMS = {
  ...ENGINE.draw,
  masteryThreshold: ENGINE.mastery.threshold,
} as const;
const SEED = 'attempt-1';
const TARGET = ENGINE.draw.defaultSize;

const DEMO_NOTIONS: DrawNotion[] = SAP_NOTIONS.filter((notion) => notion.moduleId === 'sap-m3')
  .slice(0, 8)
  .map((notion) => ({
    ...notion,
    mastery: SAP_MASTERY_AT_REFERENCE[notion.notionId] ?? null,
  }));
const DEMO_LABELS = new Map(DEMO_NOTIONS.map((notion) => [notion.notionId, notion]));
const DEMO_GAPS: DrawGap[] = SAP_GAPS_AT_REFERENCE.filter((gap) =>
  DEMO_NOTIONS.some((notion) => notion.notionId === gap.notionId),
).map((gap) => ({ notionId: gap.notionId, nature: gap.nature }));

function fingerprint(value: number): string {
  return value.toString(16).padStart(64, '0');
}

function makeBrick(
  notionId: string,
  index: number,
  turn: number,
  format: DrawBrick['format'],
  overrides: Partial<DrawBrick> = {},
): DrawBrick {
  return {
    brickId: `b-${String(index)}-${String(turn)}`,
    brickVersionId: `v-${String(index)}-${String(turn)}`,
    notionIds: [notionId],
    format,
    status: 'active',
    valid: true,
    ownedByLearner: true,
    fingerprint: fingerprint(index * 10 + turn + 1),
    ...overrides,
  };
}

function buildBank(notions: readonly DrawNotion[]): DrawBrick[] {
  const bricks: DrawBrick[] = [];
  for (const [index, notion] of notions.entries()) {
    bricks.push(makeBrick(notion.notionId, index, 0, 'choice_question'));
    bricks.push(makeBrick(notion.notionId, index, 1, 'cloze'));
    bricks.push(makeBrick(notion.notionId, index, 2, 'matching'));
    bricks.push(makeBrick(notion.notionId, index, 3, 'open_question'));
    bricks.push(makeBrick(notion.notionId, index, 4, 'open_question'));
  }
  return bricks;
}

const MAIN_BANK = buildBank(DEMO_NOTIONS);
const SEEN = [fingerprint(1), fingerprint(11)];
const FIRST_NOTION = DEMO_NOTIONS[0]?.notionId ?? 'n-piece';
const BANK_WITH_VARIANTS: DrawBrick[] = [
  ...MAIN_BANK,
  makeBrick(FIRST_NOTION, 0, 0, 'choice_question', {
    brickId: 'duplicate-brick',
    brickVersionId: 'duplicate-version',
    fingerprint: fingerprint(2),
  }),
  makeBrick(FIRST_NOTION, 90, 0, 'choice_question', {
    brickId: 'retired-brick',
    status: 'retired',
  }),
  makeBrick(FIRST_NOTION, 91, 0, 'choice_question', {
    brickId: 'reported-brick',
    status: 'reported',
  }),
  makeBrick(FIRST_NOTION, 92, 0, 'choice_question', {
    brickId: 'invalid-brick',
    valid: false,
  }),
  makeBrick(FIRST_NOTION, 93, 0, 'choice_question', {
    brickId: 'foreign-brick',
    ownedByLearner: false,
  }),
  makeBrick(FIRST_NOTION, 94, 0, 'choice_question', {
    brickId: 'no-fingerprint',
    fingerprint: null,
  }),
  makeBrick(FIRST_NOTION, 95, 0, 'instruction', { brickId: 'instruction-brick' }),
];

const SMALL_BANK = [
  makeBrick(DEMO_NOTIONS[0]?.notionId ?? 'n-piece', 70, 0, 'choice_question'),
  makeBrick(DEMO_NOTIONS[0]?.notionId ?? 'n-piece', 70, 1, 'open_question'),
  makeBrick(DEMO_NOTIONS[1]?.notionId ?? 'n-entete', 71, 0, 'choice_question'),
];

const MANY_NOTIONS: DrawNotion[] = SAP_NOTIONS.slice(0, 21).map((notion) => ({
  ...notion,
  mastery: 70,
}));
const MANY_BANK = MANY_NOTIONS.flatMap((notion, index) => [
  makeBrick(notion.notionId, 200 + index, 0, 'choice_question'),
  makeBrick(notion.notionId, 200 + index, 1, 'open_question'),
]);

const MAIN: DrawAttemptResult = drawAttempt({
  notions: DEMO_NOTIONS,
  bank: BANK_WITH_VARIANTS,
  seenFingerprints: SEEN,
  gaps: DEMO_GAPS,
  params: PARAMS,
  targetCount: TARGET,
  seed: SEED,
});
const PERMUTED: DrawAttemptResult = drawAttempt({
  notions: [...DEMO_NOTIONS].reverse(),
  bank: [...BANK_WITH_VARIANTS].reverse(),
  seenFingerprints: [...SEEN].reverse(),
  gaps: [...DEMO_GAPS].reverse(),
  params: PARAMS,
  targetCount: TARGET,
  seed: SEED,
});
const SMALL: DrawAttemptResult = drawAttempt({
  notions: DEMO_NOTIONS,
  bank: SMALL_BANK,
  seenFingerprints: [],
  gaps: DEMO_GAPS,
  params: PARAMS,
  targetCount: TARGET,
  seed: 'attempt-exhausted',
});
const MANY: DrawAttemptResult = drawAttempt({
  notions: MANY_NOTIONS,
  bank: MANY_BANK,
  seenFingerprints: [],
  gaps: [],
  params: PARAMS,
  targetCount: ENGINE.draw.maxSize,
  seed: 'attempt-21-notions',
});

const FORMAT_LABELS: Readonly<Record<string, string>> = {
  choice_question: 'Choix',
  cloze: 'Texte à trous',
  matching: 'Association',
  open_question: 'Ouverte',
};
const SHARE_LABELS = { choice: 'Choix', open: 'Ouverte' } as const;
const EXHAUSTION_LABELS = {
  capacity: 'Capacité',
  bank_exhausted: 'Banque épuisée',
  size_limit: 'Limite de taille',
} as const;

const percent = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const identical =
  JSON.stringify(MAIN.questions.map((question) => [question.brickId, question.brickVersionId])) ===
  JSON.stringify(PERMUTED.questions.map((question) => [question.brickId, question.brickVersionId]));
const mainOpens = MAIN.questions.filter((question) => question.share === 'open').length;
const mainChoices = MAIN.questions.length - mainOpens;
const covered = MAIN.plan.filter((entry) => entry.selected > 0).length;

function labelOf(notionId: string): string {
  return DEMO_LABELS.get(notionId)?.label ?? notionId;
}

function NotionCell({ notionId }: Readonly<{ notionId: string }>) {
  return (
    <span>
      <span className="font-600">{labelOf(notionId)}</span>{' '}
      <span className="font-mono text-xs text-ink-muted">{notionId}</span>
    </span>
  );
}

function GapBadge({ gap }: Readonly<{ gap: boolean }>) {
  return gap ? <Badge tone="orange">Lacune</Badge> : <Badge tone="green">Stable</Badge>;
}

function ScrollTable({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="mt-4 overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export default function Spec405Demo() {
  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="draw-inputs" title="Entrées du tirage">
        <p className="text-sm text-ink-muted">
          Huit notions du module, deux lacunes actives, une banque suffisante et un jeu d’empreintes
          déjà vues. Le tirage est recalculé à chaque rendu par la fonction pure, sans écriture.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Notions</dt>
            <dd data-testid="draw-notion-count" className="font-mono font-600">
              {DEMO_NOTIONS.length}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Lacunes</dt>
            <dd data-testid="draw-gap-count" className="font-mono font-600">
              {DEMO_GAPS.length}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Taille choisie</dt>
            <dd data-testid="draw-target" className="font-mono font-600">
              {TARGET}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Graine</dt>
            <dd data-testid="draw-seed" className="font-mono font-600">
              {SEED}
            </dd>
          </div>
        </dl>
        <ScrollTable label="Notions et banque">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Notions et banque disponible</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Notion
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Maîtrise
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  État
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Questions en banque
                </th>
              </tr>
            </thead>
            <tbody>
              {DEMO_NOTIONS.map((notion) => {
                const gap = DEMO_GAPS.some((entry) => entry.notionId === notion.notionId);
                const available = MAIN_BANK.filter((brick) =>
                  brick.notionIds.includes(notion.notionId),
                ).length;
                return (
                  <tr key={notion.notionId} data-testid={`draw-notion-${notion.notionId}`}>
                    <td className="border-b border-divider py-2 pr-3">
                      <NotionCell notionId={notion.notionId} />
                    </td>
                    <td className="border-b border-divider py-2 pr-3 tabular-nums">
                      {notion.mastery === null || notion.mastery === undefined
                        ? '—'
                        : `${percent.format(notion.mastery)}\u00a0%`}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      <GapBadge gap={gap} />
                    </td>
                    <td className="border-b border-divider py-2 pr-3 tabular-nums">{available}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollTable>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-5">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Banque fournie</dt>
            <dd data-testid="draw-bank-size" className="font-mono font-600">
              {MAIN.diagnostics.bankSize}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Éligibles</dt>
            <dd data-testid="draw-bank-eligible" className="font-mono font-600">
              {MAIN.diagnostics.eligible}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Empreintes uniques</dt>
            <dd data-testid="draw-bank-unique" className="font-mono font-600">
              {MAIN.diagnostics.unique}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Vues exclues</dt>
            <dd data-testid="draw-seen-excluded" className="font-mono font-600">
              {MAIN.diagnostics.seenExcluded}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Doublons</dt>
            <dd data-testid="draw-duplicates" className="font-mono font-600">
              {MAIN.diagnostics.duplicateFingerprints}
            </dd>
          </div>
        </dl>
      </BaseCard>

      <BaseCard testId="draw-plan" title="Quotas et surpondération des lacunes">
        <p className="text-sm text-ink-muted">
          Une question par notion, puis le reste au plus fort reste avec les poids 3 (lacune), 2
          (maîtrise sous le seuil) et 1 (autre). Les lacunes passent en premier.
        </p>
        <ScrollTable label="Quotas par notion">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Quotas par notion</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Priorité
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Notion
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Lacune
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Poids
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Quota
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Tirées
                </th>
              </tr>
            </thead>
            <tbody>
              {MAIN.plan.map((entry) => (
                <tr key={entry.notionId} data-testid={`draw-plan-${entry.notionId}`}>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">
                    {entry.priority + 1}
                  </td>
                  <td className="border-b border-divider py-2 pr-3">
                    <NotionCell notionId={entry.notionId} />
                  </td>
                  <td className="border-b border-divider py-2 pr-3">
                    <GapBadge gap={entry.gap} />
                  </td>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">{entry.weight}</td>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">{entry.quota}</td>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">
                    {entry.selected}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
        <p data-testid="draw-quota-sum" className="mt-3 text-sm">
          Somme des quotas :{' '}
          <span className="font-mono font-600">
            {MAIN.plan.reduce((sum, entry) => sum + entry.quota, 0)}
          </span>
        </p>
      </BaseCard>

      <BaseCard testId="draw-result" title="Tirage calculé" role="status">
        <div className="flex flex-wrap items-center gap-3">
          <Badge data-testid="draw-size-badge" tone="indigo">
            {MAIN.size} questions
          </Badge>
          <Badge data-testid="draw-covered-badge" tone="green">
            {covered} notions couvertes
          </Badge>
          <Badge data-testid="draw-open-badge" tone="violet">
            {mainOpens} ouvertes
          </Badge>
          <Badge data-testid="draw-choice-badge" tone="lime-soft">
            {mainChoices} choix
          </Badge>
          <Badge data-testid="draw-minimum-badge" tone={MAIN.minimumReached ? 'green' : 'orange'}>
            {MAIN.minimumReached ? 'Taille minimale atteinte' : 'Taille minimale non atteinte'}
          </Badge>
        </div>
        <p data-testid="draw-points" className="mt-3 text-sm text-ink-muted">
          Points par question : {MAIN.questions[0]?.points ?? 0} · total{' '}
          {MAIN.questions.reduce((sum, question) => sum + question.points, 0).toFixed(2)}
        </p>
        <ScrollTable label="Questions tirées">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Questions tirées</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  #
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Notion
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Format
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  Empreinte
                </th>
              </tr>
            </thead>
            <tbody>
              {MAIN.questions.map((question, index) => (
                <tr key={question.brickId} data-testid={`draw-question-${String(index + 1)}`}>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">{index + 1}</td>
                  <td className="border-b border-divider py-2 pr-3">
                    <NotionCell notionId={question.notionId} />
                  </td>
                  <td className="border-b border-divider py-2 pr-3">
                    {FORMAT_LABELS[question.format] ?? question.format}{' '}
                    <span className="text-xs text-ink-muted">({SHARE_LABELS[question.share]})</span>
                  </td>
                  <td className="border-b border-divider py-2 pr-3 font-mono text-[10px] break-all">
                    {question.fingerprint}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </BaseCard>

      <BaseCard testId="draw-exhaustion" title="Épuisement explicite">
        <p className="text-sm text-ink-muted">
          Aucune question n’est inventée : la banque courte et le module de plus de 20 notions
          produisent des rapports distincts et lisibles.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div data-testid="draw-exhausted-small" className="rounded-18 bg-canvas p-4">
            <h3 className="font-600">Banque courte</h3>
            <p className="mt-1 text-sm">
              <Badge tone="orange">Banque épuisée</Badge>{' '}
              <span className="font-mono">{SMALL.size}</span> question(s) tirée(s)
            </p>
            <p data-testid="draw-exhausted-small-uncovered" className="mt-2 text-sm">
              Notions non couvertes :{' '}
              <span className="font-mono">{SMALL.uncoveredNotionIds.length}</span>
            </p>
            <p data-testid="draw-exhausted-small-formats" className="mt-1 text-sm">
              Formats épuisés :{' '}
              {SMALL.exhaustedFormats.length === 0
                ? 'aucun'
                : SMALL.exhaustedFormats.map((share) => SHARE_LABELS[share]).join(', ')}
            </p>
            <p data-testid="draw-exhausted-small-minimum" className="mt-1 text-sm">
              Taille minimale : {SMALL.minimumReached ? 'atteinte' : 'non atteinte'}
            </p>
          </div>
          <div data-testid="draw-exhausted-many" className="rounded-18 bg-canvas p-4">
            <h3 className="font-600">Plus de 20 notions</h3>
            <p className="mt-1 text-sm">
              <Badge tone={MANY.coverageLimited ? 'orange' : 'green'}>
                {MANY.coverageLimited ? 'Limite de couverture' : 'Couverture complète'}
              </Badge>{' '}
              <span className="font-mono">{MANY.size}</span> question(s)
            </p>
            <p data-testid="draw-exhausted-many-uncovered" className="mt-2 text-sm">
              Notions non couvertes :{' '}
              <span className="font-mono">{MANY.uncoveredNotionIds.length}</span>
            </p>
            <p data-testid="draw-exhausted-many-reasons" className="mt-1 text-sm">
              Motifs :{' '}
              {MANY.exhausted.map((entry) => EXHAUSTION_LABELS[entry.reason]).join(', ') || 'aucun'}
            </p>
          </div>
        </div>
      </BaseCard>

      <BaseCard testId="draw-determinism" title="Même graine, entrée permutée">
        <p className="text-sm text-ink-muted">
          Les notions, la banque, les lacunes et les empreintes sont inversées : l’ordre canonique
          rétablit exactement le même tirage.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Badge data-testid="draw-determinism-status" tone={identical ? 'green' : 'orange'}>
            {identical ? 'Identique' : 'Différent'}
          </Badge>
          <span data-testid="draw-determinism-size" className="text-sm tabular-nums">
            {MAIN.size} / {PERMUTED.size} questions
          </span>
        </div>
        <p data-testid="draw-determinism-refs" className="mt-2 font-mono text-xs break-all">
          {MAIN.questions
            .map((question) => `${question.brickId}:${question.brickVersionId}`)
            .join(' · ')}
        </p>
      </BaseCard>
    </>
  );
}
