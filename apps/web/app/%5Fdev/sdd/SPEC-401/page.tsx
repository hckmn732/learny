import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ENGINE } from '@learny/config/product';
import {
  createSeededRandom,
  fnv1a32,
  instantAt,
  localDateOf,
  localMinutesOf,
} from '@learny/learning-engine';
import {
  SAP_CHAPTERS,
  SAP_FORMATION,
  SAP_LINKS,
  SAP_MODULES,
  SAP_NOTIONS,
} from '@learny/learning-engine/fixtures';
import { Badge } from '@learny/ui';

import { BaseTokenStyle } from '../../../../components/sdd/base-tokens';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

interface ParamRow {
  key: keyof typeof ENGINE;
  label: string;
  summary: string;
}

const decimal = (value: number, digits = 2): string => value.toFixed(digits).replace('.', ',');

const enabledLabel = (enabled: boolean): string => (enabled ? 'oui' : 'non');

const PARAM_ROWS: readonly ParamRow[] = [
  {
    key: 'mastery',
    label: 'Maîtrise',
    summary: `demi-vie ${String(ENGINE.mastery.halfLifeDays)} j · seuil ${String(ENGINE.mastery.threshold)} % · ${String(ENGINE.mastery.decimals)} décimales`,
  },
  {
    key: 'fsrs',
    label: 'Répétition espacée',
    summary: `rétention ${decimal(ENGINE.fsrs.requestRetention)} · fuzz ${enabledLabel(ENGINE.fsrs.enableFuzz)} · médiane ${String(ENGINE.fsrs.defaultMedianMs / 1000)} s`,
  },
  {
    key: 'gaps',
    label: 'Lacunes',
    summary: `échec ${decimal(ENGINE.gaps.failureRatio * 100, 0)} % · oubli ≥ ${String(ENGINE.gaps.forgettingMinDays)} j · levée ${String(ENGINE.gaps.clearSuccesses)} succès`,
  },
  {
    key: 'draw',
    label: 'Tirage d’une tentative',
    summary: `${String(ENGINE.draw.defaultSize)} questions (${String(ENGINE.draw.minSize)}–${String(ENGINE.draw.maxSize)}) · ${decimal(ENGINE.draw.openShare * 100, 0)} % ouvertes · barème ${String(ENGINE.draw.totalPoints)}`,
  },
  {
    key: 'globalQuiz',
    label: 'Quiz global',
    summary: `${String(ENGINE.globalQuiz.maxMinutesDefault)} min (${ENGINE.globalQuiz.allowedMaxMinutes.join('/')}) · micro-séance ${String(ENGINE.globalQuiz.microMinutesDefault)} min`,
  },
  {
    key: 'planner',
    label: 'Planificateur',
    summary: `révision ${String(ENGINE.planner.revisionTailMinutes)} min · quiz global ${String(ENGINE.planner.globalQuizMinutes)} min · sprint ${String(ENGINE.planner.sprintMinutes)} min`,
  },
  {
    key: 'retention',
    label: 'Rétention',
    summary: `horizons ${ENGINE.retention.horizonsDays.join('/')} j · tolérance ${String(ENGINE.retention.toleranceDays)} j`,
  },
  {
    key: 'streak',
    label: 'Série',
    summary: `lecture ${String(ENGINE.streak.readingMinSeconds)} s · régularité ${String(ENGINE.streak.regularityDays)} j`,
  },
  {
    key: 'milestones',
    label: 'Jalons',
    summary: `${String(ENGINE.milestones.notionsRetained)} notions · ${String(ENGINE.milestones.streakDays)} j · seuil ${String(ENGINE.milestones.masteryThreshold)} %`,
  },
  {
    key: 'warmup',
    label: 'Échauffement',
    summary: `${String(ENGINE.warmup.defaultCount)} questions (${ENGINE.warmup.allowedCounts.join('/')}) · portée ${ENGINE.warmup.defaultScope}`,
  },
];

interface TimeCase {
  label: string;
  input: string;
  expected: string;
  actual: string;
}

const TIME_CASES: readonly TimeCase[] = [
  {
    label: 'instantAt printemps',
    input: '2027-03-28 02:30 · Europe/Paris',
    expected: '2027-03-28T01:30:00.000Z',
    actual: instantAt('2027-03-28', '02:30', 'Europe/Paris'),
  },
  {
    label: 'instantAt automne',
    input: '2026-10-25 02:30 · Europe/Paris',
    expected: '2026-10-25T00:30:00.000Z',
    actual: instantAt('2026-10-25', '02:30', 'Europe/Paris'),
  },
  {
    label: 'localDateOf Kiritimati',
    input: '2026-11-11T12:20:00.000Z · Pacific/Kiritimati',
    expected: '2026-11-12',
    actual: localDateOf('2026-11-11T12:20:00.000Z', 'Pacific/Kiritimati'),
  },
  {
    label: 'localDateOf Pago Pago',
    input: '2026-11-11T12:20:00.000Z · Pacific/Pago_Pago',
    expected: '2026-11-11',
    actual: localDateOf('2026-11-11T12:20:00.000Z', 'Pacific/Pago_Pago'),
  },
  {
    label: 'localMinutesOf Paris',
    input: '2026-11-11T12:20:00.000Z · Europe/Paris',
    expected: '800',
    actual: String(localMinutesOf('2026-11-11T12:20:00.000Z', 'Europe/Paris')),
  },
  {
    label: 'localMinutesOf Kiritimati',
    input: '2026-11-11T12:20:00.000Z · Pacific/Kiritimati',
    expected: '140',
    actual: String(localMinutesOf('2026-11-11T12:20:00.000Z', 'Pacific/Kiritimati')),
  },
  {
    label: 'localMinutesOf Pago Pago',
    input: '2026-11-11T12:20:00.000Z · Pacific/Pago_Pago',
    expected: '80',
    actual: String(localMinutesOf('2026-11-11T12:20:00.000Z', 'Pacific/Pago_Pago')),
  },
];

const RANDOM_SEED = 'SPEC-401';
const seeded = createSeededRandom(RANDOM_SEED);
const RANDOM_DRAWS = Array.from({ length: 5 }, () => seeded().toFixed(6));

const STATS = [
  { value: String(SAP_MODULES.length), label: 'modules' },
  { value: String(SAP_CHAPTERS.length), label: 'chapitres' },
  { value: String(SAP_NOTIONS.length), label: 'notions' },
  { value: String(SAP_LINKS.length), label: 'liens' },
] as const;

const CARD = 'rounded-24 border border-solid border-border bg-surface p-6';

export default function Spec401DemoPage() {
  if (!sddPagesEnabled()) notFound();

  return (
    <main data-testid="sdd-demo" className="mx-auto max-w-4xl p-8">
      <BaseTokenStyle />
      <p className="text-14 text-ink-muted">Socle du moteur</p>
      <h1 data-testid="sdd-title" className="mt-2 font-display text-34 font-600 tracking-title">
        SPEC-401 · Socle du moteur
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        {`${SAP_FORMATION.title} · du ${SAP_FORMATION.startDate} au ${SAP_FORMATION.endDate} · ${SAP_FORMATION.tz}`}
      </p>

      <section data-testid="engine-params" className={`mt-6 ${CARD}`}>
        <h2 className="font-display text-xl font-600">Paramètres du moteur</h2>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <caption className="sr-only">Paramètres par défaut de la constante ENGINE</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Clé
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Domaine
              </th>
              <th scope="col" className="border-b border-border py-2">
                Valeurs principales
              </th>
            </tr>
          </thead>
          <tbody>
            {PARAM_ROWS.map((row) => (
              <tr key={row.key} data-testid={`engine-param-${row.key}`}>
                <td className="border-b border-divider py-2 pr-3 font-mono text-xs">{row.key}</td>
                <td className="border-b border-divider py-2 pr-3 font-600">{row.label}</td>
                <td className="border-b border-divider py-2">{row.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section data-testid="sap-reference" className={`mt-6 ${CARD}`}>
        <h2 className="font-display text-xl font-600">Jeu de référence SAP</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {STATS.map((stat, index) => (
            <div
              key={stat.label}
              className={
                index === 0
                  ? 'stat-card box-border min-w-36 flex-1 rounded-24 bg-ink p-5 text-white'
                  : 'stat-card box-border min-w-36 flex-1 rounded-24 border border-solid border-border bg-surface p-5'
              }
              data-testid={`sap-stat-${stat.label}`}
            >
              <span
                className={
                  index === 0
                    ? 'block font-display text-34 font-600 leading-1.1 text-lime'
                    : 'block font-display text-34 font-600 leading-1.1 text-ink'
                }
              >
                {stat.value}
              </span>
              <span
                className={
                  index === 0
                    ? 'mt-1 block text-13 text-on-dark-secondary'
                    : 'mt-1 block text-13 text-ink-muted'
                }
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>
        <table className="mt-5 w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Modules, dates, heures, chapitres et notions du jeu SAP
          </caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border py-2 pr-3">
                N°
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Module
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Dates
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Heures
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Chapitres
              </th>
              <th scope="col" className="border-b border-border py-2">
                Notions
              </th>
            </tr>
          </thead>
          <tbody>
            {SAP_MODULES.map((module) => (
              <tr key={module.moduleId} data-testid={`sap-module-${module.moduleId}`}>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  {String(module.position)}
                </td>
                <td className="border-b border-divider py-2 pr-3 font-600">{module.title}</td>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  {`${module.startsOn} → ${module.endsOn}`}
                </td>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  {`${String(module.hours)} h`}
                </td>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  {String(module.chapters.length)}
                </td>
                <td className="border-b border-divider py-2 tabular-nums">
                  {String(
                    SAP_NOTIONS.filter((notion) => notion.moduleId === module.moduleId).length,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section data-testid="time-cases" className={`mt-6 ${CARD}`}>
        <h2 className="font-display text-xl font-600">Cas de temps</h2>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <caption className="sr-only">Cas de fuseau et de changement d’heure vérifiés</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Cas
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Entrée
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Sortie attendue
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Sortie obtenue
              </th>
              <th scope="col" className="border-b border-border py-2">
                Résultat
              </th>
            </tr>
          </thead>
          <tbody>
            {TIME_CASES.map((timeCase, index) => {
              const ok = timeCase.actual === timeCase.expected;
              return (
                <tr key={timeCase.label}>
                  <td className="border-b border-divider py-2 pr-3 font-600">{timeCase.label}</td>
                  <td className="border-b border-divider py-2 pr-3 text-xs">{timeCase.input}</td>
                  <td className="border-b border-divider py-2 pr-3 font-mono text-xs">
                    {timeCase.expected}
                  </td>
                  <td className="border-b border-divider py-2 pr-3 font-mono text-xs">
                    {timeCase.actual}
                  </td>
                  <td className="border-b border-divider py-2">
                    <Badge
                      tone={ok ? 'green' : 'orange'}
                      aria-label={ok ? 'Conforme' : 'Non conforme'}
                      data-testid={`time-case-badge-${String(index)}`}
                    >
                      {ok ? '✓' : '✗'}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section data-testid="random-cases" className={`mt-6 ${CARD}`}>
        <h2 className="font-display text-xl font-600">Aléa à graine</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">fnv1a32('')</dt>
            <dd data-testid="fnv-empty" className="font-mono text-lg font-600">
              {String(fnv1a32(''))}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">fnv1a32('a')</dt>
            <dd data-testid="fnv-a" className="font-mono text-lg font-600">
              {String(fnv1a32('a'))}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-ink-muted">{`Cinq premiers tirages de createSeededRandom('${RANDOM_SEED}')`}</p>
        <ol className="mt-2 grid gap-2 font-mono text-sm sm:grid-cols-5">
          {RANDOM_DRAWS.map((value, index) => (
            <li
              key={`${String(index)}-${value}`}
              data-testid={`random-draw-${String(index)}`}
              className="rounded-12 bg-canvas px-3 py-2 text-center"
            >
              {value}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
