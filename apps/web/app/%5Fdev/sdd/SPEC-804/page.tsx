import fs from 'node:fs';
import path from 'node:path';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { Card } from '@learny/ui';

import { DemoShell } from '../../../../components/sdd/demo-shell';
import { Spec804Live } from '../../../../components/sdd-demos/spec-804';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';
import { fr } from '../../../../messages/fr/sdd';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const t = fr.sdd.spec804;

interface PageReport {
  url: string;
  ok: boolean;
  metrics: Record<string, { p75: number }>;
}
interface Report {
  generatedAt: string;
  commit: string;
  lighthouse?: { pages?: PageReport[]; ok?: boolean };
  inp?: { scenarios?: { name: string; p75: number | null; ok: boolean }[]; ok?: boolean };
  k6?: { routes?: { name: string; p95: number | null; ok: boolean }[]; ok?: boolean };
}

function reportPath(): string {
  if (process.env.PERF_REPORT_PATH !== undefined) return process.env.PERF_REPORT_PATH;
  if (process.env.PERF_DEMO_FIXTURE === '1') {
    return path.join(process.cwd(), 'e2e', 'fixtures', 'perf-report.sample.json');
  }
  return path.join(process.cwd(), '..', '..', 'evidence', 'SPEC-804', 'perf-report.json');
}

function loadReport(): Report | null {
  try {
    return JSON.parse(fs.readFileSync(reportPath(), 'utf8')) as Report;
  } catch {
    return null;
  }
}

const BUDGETS = [
  t.budgets.lcp,
  t.budgets.inp,
  t.budgets.cls,
  t.budgets.tbt,
  t.budgets.score,
  t.budgets.js,
  t.budgets.css,
  t.budgets.fonts,
  t.budgets.images,
  t.budgets.requests,
  t.budgets.api,
];

const cell = 'py-2 pr-4 align-top';

function ReportSection({ report }: Readonly<{ report: Report | null }>) {
  if (report === null) {
    return (
      <section data-testid="perf-report">
        <h2 className="text-xl font-semibold">{t.lastReport.title}</h2>
        <p className="mt-4">{t.lastReport.empty}</p>
      </section>
    );
  }
  const status = report.lighthouse?.ok && report.inp?.ok && report.k6?.ok;
  return (
    <section data-testid="perf-report">
      <h2 className="text-xl font-semibold">{t.lastReport.title}</h2>
      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-13 text-ink-muted">{t.lastReport.date}</dt>
          <dd data-testid="perf-report-date" className="font-mono">
            {report.generatedAt}
          </dd>
        </div>
        <div>
          <dt className="text-13 text-ink-muted">{t.lastReport.commit}</dt>
          <dd data-testid="perf-report-commit" className="font-mono">
            {report.commit}
          </dd>
        </div>
        <div>
          <dt className="text-13 text-ink-muted">{t.lastReport.global}</dt>
          <dd data-testid="perf-report-status" className="font-600">
            {status ? t.lastReport.ok : t.lastReport.ko}
          </dd>
        </div>
      </dl>

      <h3 className="mt-6 font-600">{t.lastReport.pages}</h3>
      <div
        role="region"
        aria-label={t.lastReport.pages}
        tabIndex={0}
        className="mt-2 overflow-x-auto"
      >
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr>
              {t.lastReport.pageColumns.map((column) => (
                <th key={column} scope="col" className={cell}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(report.lighthouse?.pages ?? []).map((page) => (
              <tr key={page.url} data-testid="perf-report-page">
                <td className={`${cell} font-mono`}>{new URL(page.url).pathname}</td>
                <td className={cell}>{Math.round(page.metrics.lcp?.p75 ?? 0)} ms</td>
                <td className={cell}>{(page.metrics.cls?.p75 ?? 0).toFixed(3)}</td>
                <td className={cell}>{Math.round(page.metrics.tbt?.p75 ?? 0)} ms</td>
                <td className={cell}>{Math.round(page.metrics.score?.p75 ?? 0)}</td>
                <td className={cell}>{page.ok ? t.lastReport.ok : t.lastReport.ko}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 font-600">{t.lastReport.scenarios}</h3>
      <div
        role="region"
        aria-label={t.lastReport.scenarios}
        tabIndex={0}
        className="mt-2 overflow-x-auto"
      >
        <table className="w-full min-w-[520px] text-left">
          <thead>
            <tr>
              {t.lastReport.scenarioColumns.map((column) => (
                <th key={column} scope="col" className={cell}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(report.inp?.scenarios ?? []).map((scenario) => (
              <tr key={scenario.name} data-testid="perf-report-scenario">
                <td className={cell}>{scenario.name}</td>
                <td className={cell}>
                  {scenario.p75 === null ? '—' : `${String(Math.round(scenario.p75))} ms`}
                </td>
                <td className={cell}>{scenario.ok ? t.lastReport.ok : t.lastReport.ko}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 font-600">{t.lastReport.routes}</h3>
      <div
        role="region"
        aria-label={t.lastReport.routes}
        tabIndex={0}
        className="mt-2 overflow-x-auto"
      >
        <table className="w-full min-w-[520px] text-left">
          <thead>
            <tr>
              {t.lastReport.routeColumns.map((column) => (
                <th key={column} scope="col" className={cell}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(report.k6?.routes ?? []).map((route) => (
              <tr key={route.name} data-testid="perf-report-route">
                <td className={`${cell} font-mono`}>{route.name}</td>
                <td className={cell}>
                  {route.p95 === null ? '—' : `${String(Math.round(route.p95))} ms`}
                </td>
                <td className={cell}>{route.ok ? t.lastReport.ok : t.lastReport.ko}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function Spec804DemoPage() {
  await connection();
  if (!sddPagesEnabled()) notFound();
  const report = loadReport();
  return (
    <DemoShell
      specId="SPEC-804"
      title={t.title}
      titleTestId="sdd-title"
      titleClassName="mt-2 font-display text-34 font-600 tracking-title"
    >
      <Card className="mt-6">
        <section data-testid="perf-budgets">
          <h2 className="text-xl font-semibold">{t.budgets.title}</h2>
          <p className="mt-2 text-14 text-ink-muted">{t.budgets.intro}</p>
          <div
            role="region"
            aria-label={t.budgets.region}
            tabIndex={0}
            className="mt-4 overflow-x-auto"
          >
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr>
                  {t.budgets.columns.map((column) => (
                    <th key={column} scope="col" className={cell}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BUDGETS.map(([label, budget]) => (
                  <tr key={label} data-testid="perf-budget-row">
                    <td className={cell}>{label}</td>
                    <td className={`${cell} font-mono`}>{budget}</td>
                    <td className={cell}>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Card>
      <Card className="mt-6">
        <ReportSection report={report} />
      </Card>
      <Card className="mt-6">
        <h2 className="text-xl font-semibold">{t.live.title}</h2>
        <div className="mt-4">
          <Spec804Live />
        </div>
      </Card>
    </DemoShell>
  );
}
