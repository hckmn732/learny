// SPEC-807 §10 — démonstration de la matrice des parcours V1 et des résultats de la dernière
// exécution. La matrice est lue dans `docs/quality/v1-journeys.md` ; les statuts proviennent
// uniquement des rapports de `evidence/SPEC-807/` (Playwright JSON des projets journeys et ratios
// visuels). Sans rapport, chaque statut reste « Non exécuté » : rien n'est jamais déclaré réussi
// par simple présence d'un test ou d'une ligne de matrice.
import fs from 'node:fs';
import path from 'node:path';

import { fr } from '@learny/i18n/fr/sdd';

import { BaseCard } from '../sdd/base-tokens';

const t = fr.sdd.spec807;

export type JourneyStatus = 'passed' | 'failed' | 'not_run';

export const ENGINES = [
  { project: 'journeys', label: 'Chromium' },
  { project: 'journeys-firefox', label: 'Firefox' },
  { project: 'journeys-webkit', label: 'WebKit' },
] as const;

const MOCKUP_MAX_DIFF_RATIO = 0.12;

interface Step {
  id: string;
  action: string;
  routes: string[];
  spec: string;
  rules: string;
}

interface Journey {
  id: string;
  title: string;
  testFile: string;
  testTitle: string;
  steps: Step[];
}

interface Screen {
  id: string;
  state: string;
}

interface Matrix {
  journeys: Journey[];
  screens: Screen[];
}

interface PwResult {
  status?: string;
}
interface PwTest {
  projectName?: string;
  status?: string;
  results?: PwResult[];
}
interface PwSpec {
  title?: string;
  file?: string;
  tests?: PwTest[];
}
interface PwSuite {
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}
interface PwReport {
  stats?: { startTime?: string };
  suites?: PwSuite[];
}

interface Ratios {
  generatedAt?: string;
  ratios?: { screen?: string; region?: string; ratio?: number }[];
}

function findFile(relative: string): string | null {
  for (const base of [process.cwd(), path.resolve(process.cwd(), '..', '..')]) {
    const candidate = path.resolve(base, relative);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readJson(relative: string): unknown {
  const file = findFile(relative);
  if (file === null) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function cells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function spans(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');
}

/** Lecture minimale de la matrice (le validateur `tools/quality` en contrôle la cohérence). */
export function parseJourneyMatrix(text: string): Matrix {
  const journeys: Journey[] = [];
  const screens: Screen[] = [];
  let current: Journey | null = null;
  let visual = false;
  for (const line of text.split(/\r?\n/)) {
    const heading = /^##\s+(EF-\d+)\s+[—-]\s+(.+?)\s*$/.exec(line);
    if (heading !== null) {
      visual = heading[1] === 'EF-7';
      current = visual
        ? null
        : { id: heading[1] ?? '', title: heading[2] ?? '', testFile: '', testTitle: '', steps: [] };
      if (current !== null) journeys.push(current);
      continue;
    }
    if (/^##\s/.test(line)) {
      current = null;
      visual = false;
      continue;
    }
    if (current !== null) {
      const bullet = /^-\s+([^:]+?)\s*:\s*(.*)$/.exec(line.trim());
      if (bullet !== null) {
        const key = (bullet[1] ?? '').toLowerCase();
        if (key.startsWith('fichier de test')) current.testFile = spans(bullet[2] ?? '')[0] ?? '';
        else if (key === 'test') current.testTitle = spans(bullet[2] ?? '')[0] ?? '';
        continue;
      }
    }
    const row = cells(line);
    if (row === null) continue;
    if (current !== null && /^J\d\.\d{2}$/.test(row[0] ?? '')) {
      current.steps.push({
        id: row[0] ?? '',
        action: row[1] ?? '',
        routes: spans(row[2] ?? ''),
        spec: row[3] ?? '',
        rules: row[4] ?? '',
      });
    } else if (visual && /^SCR-\d{2}$/.test(row[0] ?? '')) {
      screens.push({ id: row[0] ?? '', state: row[1] ?? '' });
    }
  }
  return { journeys, screens };
}

function collectSpecs(suites: readonly PwSuite[] | undefined, into: PwSpec[], file?: string) {
  for (const suite of suites ?? []) {
    const suiteFile = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      const specFile = spec.file ?? suiteFile;
      into.push(specFile === undefined ? spec : { ...spec, file: specFile });
    }
    collectSpecs(suite.suites, into, suiteFile);
  }
}

function testPassed(test: PwTest): boolean | null {
  if (test.status === 'skipped') return null;
  if (test.status === 'expected' || test.status === 'flaky') return true;
  if (test.status === 'unexpected') return false;
  const last = test.results?.at(-1)?.status;
  if (last === undefined || last === 'skipped') return null;
  return last === 'passed';
}

/**
 * Statut d'un parcours pour un moteur, d'après le rapport Playwright : « Non exécuté » sans rapport
 * ou sans résultat pour ce fichier et ce projet, « Échec » au moindre test en échec.
 */
export function journeyStatus(
  report: PwReport | null,
  journey: Pick<Journey, 'testFile' | 'testTitle'>,
  project: string,
): JourneyStatus {
  if (report === null || journey.testFile === '') return 'not_run';
  const specs: PwSpec[] = [];
  collectSpecs(report.suites, specs);
  const base = path.posix.basename(journey.testFile);
  const inFile = specs.filter((spec) => (spec.file ?? '').endsWith(base));
  const titled = inFile.filter((spec) => spec.title === journey.testTitle);
  const selected = titled.length > 0 ? titled : inFile;
  const outcomes = selected
    .flatMap((spec) => spec.tests ?? [])
    .filter((test) => test.projectName === project)
    .map(testPassed)
    .filter((value): value is boolean => value !== null);
  if (outcomes.length === 0) return 'not_run';
  return outcomes.every(Boolean) ? 'passed' : 'failed';
}

function statusLabel(status: JourneyStatus): string {
  if (status === 'passed') return t.statuses.passed;
  if (status === 'failed') return t.statuses.failed;
  return t.statuses.notRun;
}

function StatusBadge({ status }: Readonly<{ status: JourneyStatus }>) {
  const tone =
    status === 'passed'
      ? 'bg-teal-soft text-teal-ink'
      : status === 'failed'
        ? 'bg-orange-soft text-orange-ink-strong'
        : 'bg-canvas text-ink-secondary';
  return (
    <span
      className={`inline-flex rounded-8 px-10 py-4 text-12 font-700 ${tone}`}
      data-testid="spec-807-status"
      data-status={status}
    >
      {statusLabel(status)}
    </span>
  );
}

function loadMatrix(): Matrix {
  const file = findFile(path.join('docs', 'quality', 'v1-journeys.md'));
  if (file === null) return { journeys: [], screens: [] };
  return parseJourneyMatrix(fs.readFileSync(file, 'utf8'));
}

function loadReport(): PwReport | null {
  const parsed = readJson(path.join('evidence', 'SPEC-807', 'journeys.json'));
  return typeof parsed === 'object' && parsed !== null ? parsed : null;
}

function loadRatios(): Ratios | null {
  const parsed = readJson(path.join('evidence', 'SPEC-807', 'visual', 'ratios.json'));
  return typeof parsed === 'object' && parsed !== null ? parsed : null;
}

function screenResult(
  ratios: Ratios | null,
  screen: string,
): { status: JourneyStatus; ratio: number | null } {
  const measured = (ratios?.ratios ?? []).filter(
    (entry) => entry.screen === screen && typeof entry.ratio === 'number',
  );
  if (measured.length === 0) return { status: 'not_run', ratio: null };
  const worst = Math.max(...measured.map((entry) => entry.ratio ?? 1));
  return { status: worst <= MOCKUP_MAX_DIFF_RATIO ? 'passed' : 'failed', ratio: worst };
}

const cell = 'px-3 py-2 align-top';

function JourneyCard({ journey, report }: Readonly<{ journey: Journey; report: PwReport | null }>) {
  const testId = `spec-807-${journey.id.toLowerCase()}`;
  return (
    <BaseCard testId={testId} title={`${journey.id} · ${journey.title}`}>
      <p className="text-13 text-ink-secondary">
        {t.testFile} <span className="font-mono">{journey.testFile}</span>
      </p>
      <ul className="mt-3 flex flex-wrap gap-3" aria-label={t.enginesLabel(journey.id)}>
        {ENGINES.map((engine) => (
          <li
            key={engine.project}
            className="flex items-center gap-2 text-13"
            data-testid="spec-807-engine"
          >
            <span className="font-600">{engine.label}</span>
            <StatusBadge status={journeyStatus(report, journey, engine.project)} />
          </li>
        ))}
      </ul>
      <div
        role="region"
        aria-label={t.stepsLabel(journey.id)}
        tabIndex={0}
        className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <table className="w-full min-w-[40rem] text-left text-13">
          <thead>
            <tr>
              {t.columns.map((column) => (
                <th key={column} scope="col" className={cell}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {journey.steps.map((step) => (
              <tr key={step.id} className="border-t border-border" data-testid="spec-807-step">
                <td className={`${cell} font-mono`}>{step.id}</td>
                <td className={cell}>{step.action}</td>
                <td className={`${cell} font-mono`}>{step.routes.join(' · ')}</td>
                <td className={`${cell} font-mono`}>{step.spec}</td>
                <td className={`${cell} font-mono`}>{step.rules}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BaseCard>
  );
}

export default function Spec807Demo() {
  const matrix = loadMatrix();
  const report = loadReport();
  const ratios = loadRatios();
  const steps = matrix.journeys.reduce((total, journey) => total + journey.steps.length, 0);
  return (
    <>
      <p className="mt-6 text-13 text-ink-secondary">{t.intro}</p>
      <BaseCard testId="spec-807-run" title={t.run.title}>
        <dl className="grid grid-cols-1 gap-2 text-13 sm:grid-cols-3">
          <div>
            <dt className="text-ink-secondary">{t.run.journeys}</dt>
            <dd className="font-600" data-testid="spec-807-count">
              {t.run.count(matrix.journeys.length, steps)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-secondary">{t.run.report}</dt>
            <dd className="font-mono" data-testid="spec-807-report">
              {report === null ? t.run.noReport : (report.stats?.startTime ?? t.run.undated)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-secondary">{t.run.visual}</dt>
            <dd className="font-mono" data-testid="spec-807-visual-report">
              {ratios === null ? t.run.noReport : (ratios.generatedAt ?? t.run.undated)}
            </dd>
          </div>
        </dl>
      </BaseCard>
      {matrix.journeys.map((journey) => (
        <JourneyCard key={journey.id} journey={journey} report={report} />
      ))}
      <BaseCard testId="spec-807-visual" title={t.visual.title}>
        <div
          role="region"
          aria-label={t.visual.title}
          tabIndex={0}
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full min-w-[32rem] text-left text-13">
            <thead>
              <tr>
                {t.visual.columns.map((column) => (
                  <th key={column} scope="col" className={cell}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.screens.map((screen) => {
                const result = screenResult(ratios, screen.id);
                return (
                  <tr
                    key={screen.id}
                    className="border-t border-border"
                    data-testid="spec-807-screen"
                  >
                    <td className={`${cell} font-mono`}>{screen.id}</td>
                    <td className={cell}>{screen.state}</td>
                    <td className={`${cell} font-mono`} data-testid="spec-807-ratio">
                      {result.ratio === null ? '—' : `${(result.ratio * 100).toFixed(1)} %`}
                    </td>
                    <td className={cell}>
                      <StatusBadge status={result.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BaseCard>
      <p className="mt-4 text-13 text-ink-secondary">{t.note}</p>
    </>
  );
}
