'use client';

import { useState } from 'react';

import { ENGINE } from '@learny/config/product';
import {
  localDateOf,
  selectWarmup,
  type WarmupNotionState,
  type WarmupScope,
} from '@learny/learning-engine';
import { SAP_FORMATION, SAP_LINKS, SAP_NOTIONS } from '@learny/learning-engine/fixtures';
import { Badge, Button, StatCard, StatRow } from '@learny/ui';

import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const AT = '2026-11-11T12:20:00.000Z';
const TZ = SAP_FORMATION.tz;
const LOCAL_DATE = localDateOf(AT, TZ);
const NEXT_CHAPTER = 'sap-m3-c2';
const NEXT_CHAPTER_LABEL = 'Chapitre 3.2 — Pièce comptable et postes';
const SEED = 'spec-410';
const PARAMS = {
  defaultCount: ENGINE.warmup.defaultCount,
  allowedCounts: ENGINE.warmup.allowedCounts,
  defaultScope: ENGINE.warmup.defaultScope,
  lookbackDays: ENGINE.warmup.yesterdayLookbackDays,
} as const;

const ACCESSIBLE = [
  ...new Set(
    SAP_NOTIONS.filter((notion) => ['sap-m1', 'sap-m2', 'sap-m3'].includes(notion.moduleId)).map(
      (notion) => notion.chapterId,
    ),
  ),
];

const LABELS = new Map(SAP_NOTIONS.map((notion) => [notion.notionId, notion.label]));
const MODULES = new Map(SAP_NOTIONS.map((notion) => [notion.notionId, notion.moduleId]));

const OVERRIDES: Readonly<Record<string, Partial<WarmupNotionState>>> = {
  'n-societe': { lastSeenOn: '2026-11-10', mastery: 72.5, retrievability: 0.58 },
  'n-ledger': { lastSeenOn: '2026-11-10', mastery: 64, retrievability: 0.66 },
  'n-variante': { lastSeenOn: '2026-11-09', mastery: 41, retrievability: 0.32 },
  'n-compte': { lastSeenOn: '2026-11-08', mastery: 53.5, retrievability: 0.47 },
  'n-perimetre': { lastSeenOn: '2026-11-09', mastery: 65, retrievability: 0.7 },
  'n-type': { lastSeenOn: '2026-11-10', mastery: 55, retrievability: 0.5, suspended: true },
  'n-factf': { lastSeenOn: '2026-11-09', mastery: 30, retrievability: 0.2 },
};

const STATES: WarmupNotionState[] = SAP_NOTIONS.map((notion) => ({
  notionId: notion.notionId,
  formationId: SAP_FORMATION.formationId,
  chapterId: notion.chapterId,
  lastSeenOn: null,
  suspended: false,
  mastery: 0,
  retrievability: null,
  ...OVERRIDES[notion.notionId],
}));
STATES.push({
  notionId: 'n-autre',
  formationId: 'sap-crm',
  chapterId: 'sap-m1-c1',
  lastSeenOn: '2026-11-10',
  suspended: false,
  mastery: 10,
  retrievability: 0.1,
});
LABELS.set('n-autre', 'Notion d’une autre formation');

const LINKS = [
  ...SAP_LINKS,
  { fromNotionId: 'n-partie', toNotionId: 'n-poste', kind: 'prerequisite' as const },
  { fromNotionId: 'n-factf', toNotionId: 'n-poste', kind: 'prerequisite' as const },
  { fromNotionId: 'n-autre', toNotionId: 'n-poste', kind: 'prerequisite' as const },
];

const EMPTY_STATES = STATES.map((state) => ({
  ...state,
  lastSeenOn: null,
  retrievability: null,
}));

const REASON_LABELS = { yesterday: 'Vue hier', prerequisite: 'Prérequis' } as const;
const REASON_TONES = { yesterday: 'green', prerequisite: 'indigo' } as const;

const EXCLUSIONS = [
  { notionId: 'n-type', reason: 'Suspendue (vue hier)' },
  { notionId: 'n-partie', reason: 'Jamais vue (prérequis)' },
  { notionId: 'n-factf', reason: 'Chapitre inaccessible (module verrouillé)' },
  { notionId: 'n-autre', reason: 'Hors formation' },
  { notionId: 'n-poste', reason: 'Chapitre à venir (cible d’un prérequis)' },
] as const;

const DST_NOW = '2026-10-25T23:30:00.000Z';
const DST_LOCAL_DATE = localDateOf(DST_NOW, TZ);
const DST_SEEN_EARLY = localDateOf('2026-10-25T22:30:00.000Z', TZ);
const DST_SEEN_LATE = localDateOf('2026-10-25T23:15:00.000Z', TZ);
const DST_CHOICES = selectWarmup({
  formationId: SAP_FORMATION.formationId,
  seenNotions: [
    {
      notionId: 'n-veille',
      formationId: SAP_FORMATION.formationId,
      chapterId: 'sap-m1-c1',
      lastSeenOn: DST_SEEN_EARLY,
      suspended: false,
      mastery: 50,
      retrievability: 0.5,
    },
    {
      notionId: 'n-aujourdhui',
      formationId: SAP_FORMATION.formationId,
      chapterId: 'sap-m1-c1',
      lastSeenOn: DST_SEEN_LATE,
      suspended: false,
      mastery: 10,
      retrievability: 0.1,
    },
  ],
  prerequisiteLinks: [],
  nextChapterId: 'sap-m1-c1',
  accessibleChapterIds: ['sap-m1-c1'],
  localDate: DST_LOCAL_DATE,
  scope: 'yesterday',
  count: 5,
  seed: 'dst',
});

function notionLabel(notionId: string): string {
  return LABELS.get(notionId) ?? notionId;
}

function moduleLabel(notionId: string): string {
  const moduleId = MODULES.get(notionId) ?? '';
  return moduleId.replace('sap-m', 'Module ');
}

function percent(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
}

function score(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

export default function Spec410Demo() {
  const [scope, setScope] = useState<WarmupScope>('yesterday_and_prerequisites');
  const [count, setCount] = useState<number>(3);
  const [empty, setEmpty] = useState(false);

  const input = {
    formationId: SAP_FORMATION.formationId,
    seenNotions: empty ? EMPTY_STATES : STATES,
    prerequisiteLinks: LINKS,
    nextChapterId: NEXT_CHAPTER,
    accessibleChapterIds: ACCESSIBLE,
    localDate: LOCAL_DATE,
    scope,
    count,
    seed: SEED,
    params: PARAMS,
  } as const;
  const choices = selectWarmup(input);

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="warmup-inputs" title="Entrées de la sélection">
        <StatRow>
          <StatCard
            tone="dark"
            value={LOCAL_DATE}
            label="jour local (Europe/Paris)"
            data-testid="warmup-local-date"
          />
          <StatCard
            value={String(count)}
            label="taille demandée"
            data-testid="warmup-requested-count"
          />
          <StatCard
            value={String(choices.length)}
            label="notions retenues"
            data-testid="warmup-selected-count"
          />
          <StatCard value={NEXT_CHAPTER} label="chapitre à venir" data-testid="warmup-chapter" />
        </StatRow>

        <div className="mt-5 grid gap-4 text-13 text-ink-secondary md:grid-cols-2">
          <div data-testid="warmup-input-notions">
            <h3 className="m-0 font-display text-15 font-600 text-ink">Notions vues récemment</h3>
            <ul className="m-0 mt-2 list-none p-0">
              {STATES.filter((state) => state.lastSeenOn !== null).map((state) => (
                <li
                  key={state.notionId}
                  data-testid={`warmup-input-${state.notionId}`}
                  className="border-b border-divider py-1"
                >
                  {notionLabel(state.notionId)} · {state.lastSeenOn} · maîtrise{' '}
                  {percent(state.mastery)} · rétrievabilité {score(state.retrievability)}
                </li>
              ))}
            </ul>
          </div>
          <div data-testid="warmup-input-rules">
            <h3 className="m-0 font-display text-15 font-600 text-ink">Règles et paramètres</h3>
            <p className="m-0 mt-2">{NEXT_CHAPTER_LABEL}.</p>
            <p className="m-0 mt-1">
              Échauffement : {PARAMS.allowedCounts.join(' / ')} questions, {PARAMS.defaultCount} par
              défaut ; veille bornée à {PARAMS.lookbackDays} jours.
            </p>
            <p className="m-0 mt-1">
              Graine <code>{SEED}</code> : tri canonique puis tirage stable du complément.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant={scope === 'yesterday_and_prerequisites' ? 'dark' : 'outline'}
                onClick={() => {
                  setScope('yesterday_and_prerequisites');
                }}
                data-testid="warmup-scope-combined"
              >
                La veille et les prérequis
              </Button>
              <Button
                variant={scope === 'yesterday' ? 'dark' : 'outline'}
                onClick={() => {
                  setScope('yesterday');
                }}
                data-testid="warmup-scope-yesterday"
              >
                La veille seulement
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {PARAMS.allowedCounts.map((size) => (
                <Button
                  key={size}
                  variant={count === size ? 'dark' : 'outline'}
                  onClick={() => {
                    setCount(size);
                  }}
                  data-testid={`warmup-count-${String(size)}`}
                >
                  {String(size)} notions
                </Button>
              ))}
              <Button
                variant="outline"
                onClick={() => {
                  setEmpty((value) => !value);
                }}
                data-testid="warmup-toggle-empty"
              >
                {empty ? 'Revenir aux notions vues' : 'Simuler aucune notion vue la veille'}
              </Button>
            </div>
          </div>
        </div>
      </BaseCard>

      <BaseCard testId="warmup-selection" title="Notions sélectionnées">
        <p className="m-0 text-13 text-ink-secondary">
          Portée :{' '}
          {scope === 'yesterday_and_prerequisites'
            ? 'la veille et les prérequis'
            : 'la veille seulement'}{' '}
          · {String(choices.length)} notion{choices.length === 1 ? '' : 's'} sur {String(count)}{' '}
          demandée{count === 1 ? '' : 's'}.
        </p>
        {choices.length === 0 ? (
          <p
            role="status"
            data-testid="warmup-empty"
            className="mt-4 rounded-16 border border-solid border-border bg-canvas p-4 text-13 text-ink-secondary"
          >
            Aucune notion éligible : rien n’est créé sans notion vue la veille ni prérequis
            pertinent.
          </p>
        ) : (
          <ol
            aria-label="Notions de l’échauffement"
            className="m-0 mt-4 grid list-none gap-3 p-0 md:grid-cols-2"
          >
            {choices.map((choice) => (
              <li
                key={choice.notionId}
                data-testid={`warmup-choice-${choice.notionId}`}
                data-reason={choice.reason}
                className="rounded-16 border border-solid border-border bg-canvas p-4"
              >
                <Badge tone={REASON_TONES[choice.reason]} size="sm">
                  {REASON_LABELS[choice.reason]}
                </Badge>
                <p className="m-0 mt-2 font-display text-15 font-600 text-ink">
                  {notionLabel(choice.notionId)}
                </p>
                <p className="m-0 mt-1 text-12 text-ink-secondary">
                  {moduleLabel(choice.notionId)} · maîtrise{' '}
                  {percent(
                    STATES.find((state) => state.notionId === choice.notionId)?.mastery ?? 0,
                  )}
                </p>
              </li>
            ))}
          </ol>
        )}
      </BaseCard>

      <BaseCard testId="warmup-exclusions" title="Exclusions appliquées">
        <p className="m-0 text-13 text-ink-secondary">
          Aucune notion jamais vue, suspendue, hors formation ou d’un chapitre inaccessible ne peut
          être retenue, même liée comme prérequis.
        </p>
        <ul
          aria-label="Notions exclues"
          className="m-0 mt-3 grid list-none gap-2 p-0 md:grid-cols-2"
        >
          {EXCLUSIONS.map((exclusion) => (
            <li
              key={exclusion.notionId}
              data-testid={`warmup-exclusion-${exclusion.notionId}`}
              className="flex items-center justify-between gap-3 rounded-12 border border-solid border-border bg-canvas p-3"
            >
              <span className="text-13 text-ink">{notionLabel(exclusion.notionId)}</span>
              <span className="text-12 text-ink-muted">{exclusion.reason}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 mt-3 text-12 text-ink-muted">
          Les notions du chapitre à venir et les origines d’un seul niveau sont appliquées par le
          moteur, pas par l’affichage.
        </p>
      </BaseCard>

      <BaseCard testId="warmup-dst" title="Cas limite — passage à l’heure d’hiver">
        <p className="m-0 text-13 text-ink-secondary">
          Instant <code>{DST_NOW}</code> : jour local <strong>{DST_LOCAL_DATE}</strong>. La notion
          vue le <strong>{DST_SEEN_EARLY}</strong> est retenue comme « vue hier » ; celle vue le{' '}
          <strong>{DST_SEEN_LATE}</strong> appartient au jour même. « Hier » suit le calendrier
          local, pas une fenêtre de 24 heures.
        </p>
        <p data-testid="warmup-dst-selection" className="m-0 mt-3 font-display text-15 font-600">
          Sélection : {DST_CHOICES.map((choice) => notionLabel(choice.notionId)).join(', ')} —
          raison {DST_CHOICES.map((choice) => REASON_LABELS[choice.reason]).join(', ')}.
        </p>
        <p className="m-0 mt-1 text-12 text-ink-muted">
          Le 25 octobre 2026 dure 25 heures à Paris ; une règle « maintenant moins 24 h » aurait
          exclu la notion de la veille.
        </p>
      </BaseCard>
    </>
  );
}
