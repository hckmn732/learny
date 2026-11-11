import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DemoShell } from '../../../components/sdd/demo-shell';
import { loadSddIndex } from '../../../lib/sdd-index';
import { readSddStatus, type PublicNextAction, type PublicSpec } from '../../../lib/sdd-status';
import { fr } from '../../../messages/fr';

import { sddDemos } from './registry';

export const dynamic = 'force-dynamic';

// Demo pages are never indexed (SPEC-006, ET-3).
export const metadata: Metadata = { robots: { index: false, follow: false } };

const t = fr.sdd.index;

const STATUS_STYLE: Record<PublicSpec['status'], string> = {
  pending: 'bg-[#F4F3EF] text-[#111113]',
  ready: 'bg-[#E6F4EA] text-[#1F7A3A]',
  waiting: 'bg-[#F4F3EF] text-[#5C5B57]',
  in_progress: 'bg-[#E8F0FE] text-[#1A4FB3]',
  done: 'bg-[#E6F4EA] text-[#1F7A3A]',
  blocked: 'bg-[#FDECEA] text-[#B42318]',
  dependency_blocked: 'bg-[#FDECEA] text-[#B42318]',
};

function NextActionText({ next }: Readonly<{ next: PublicNextAction }>) {
  switch (next.kind) {
    case 'resume':
    case 'start':
      return (
        <p>
          <span className="font-semibold">
            {next.kind === 'resume' ? t.next.resume : t.next.start}
          </span>{' '}
          <span className="font-mono">{next.id}</span> — {next.title}
        </p>
      );
    case 'checkpoint':
      return (
        <p>
          <span className="font-semibold">{t.next.checkpoint}</span>{' '}
          <span className="font-mono">{next.checkpoint}</span>
        </p>
      );
    case 'finished':
      return <p>{t.next.finished}</p>;
    case 'stuck':
      return <p>{t.next.stuck(next.remaining)}</p>;
  }
}

const cardClass = 'rounded-[16px] border border-solid border-[#E7E6E1] p-6';
const sectionClass = `mt-6 ${cardClass}`;
const regionClass = 'mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2';
const cellClass = 'py-2 pr-4 align-top';

export default function SddIndexPage() {
  // The guard runs before the catalog is read (SPEC-006, ET-3).
  const index = loadSddIndex(process.env, sddDemos, readSddStatus);
  if (index === null) notFound();

  if (index.kind === 'minimal') {
    // SPEC-003 not delivered yet: explicit minimal state (ADR-0203).
    return (
      <DemoShell specId={t.surtitle} title={t.title}>
        <section data-testid="sdd-index-minimal" className={sectionClass}>
          <p aria-live="polite">{t.minimal}</p>
          <ul className="mt-4">
            {index.demos.map((d) => (
              <li key={d.id}>
                <Link href={`/_dev/sdd/${d.id}`} className="font-mono underline">
                  {d.id}
                </Link>{' '}
                — {d.title}
              </li>
            ))}
          </ul>
        </section>
      </DemoShell>
    );
  }
  const status = index.status;

  if (!status.ok) {
    return (
      <DemoShell specId={t.surtitle} title={t.title}>
        <div role="alert" data-testid="sdd-index-error" className={sectionClass}>
          <p>{t.error}</p>
          <p className="mt-2 font-mono text-sm">{`${t.requestId} : ${status.requestId}`}</p>
        </div>
      </DemoShell>
    );
  }

  const indicators = [
    { id: 'total', label: t.indicators.total, value: status.total },
    { id: 'done', label: t.indicators.done, value: status.done },
    { id: 'in-progress', label: t.indicators.inProgress, value: status.inProgress },
    { id: 'blocked', label: t.indicators.blocked, value: status.blocked },
  ];

  return (
    <DemoShell specId={t.surtitle} title={t.title}>
      <p data-testid="sdd-index-live" aria-live="polite" className="mt-4 text-sm">
        {t.loaded(status.done, status.total)}{' '}
        <Link href="/_dev/sdd" className="underline">
          {t.refresh}
        </Link>
      </p>

      <ul data-testid="sdd-index-indicators" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        {indicators.map((i) => (
          <li key={i.id} data-testid={`sdd-indicator-${i.id}`} className={cardClass}>
            <p className="text-sm">{i.label}</p>
            <p className="mt-1 text-3xl font-semibold" data-testid="sdd-indicator-value">
              {i.value}
            </p>
          </li>
        ))}
      </ul>

      <div data-testid="sdd-index-progress" className="mt-6">
        <p id="sdd-progress-label" className="text-sm">
          {`${t.progressLabel} : ${status.globalPercent.toFixed(1)} % · ${t.v1} : ${status.v1Percent.toFixed(1)} %`}
        </p>
        <div
          role="progressbar"
          aria-labelledby="sdd-progress-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={status.globalPercent}
          className="mt-2 h-3 w-full overflow-hidden rounded-full bg-[#F4F3EF]"
        >
          <div
            className="h-full bg-[#1F7A3A]"
            style={{ width: `${String(status.globalPercent)}%` }}
          />
        </div>
      </div>

      <section data-testid="sdd-index-next" className={sectionClass}>
        <h2 className="text-xl font-semibold">{t.next.title}</h2>
        <div className="mt-4">
          <NextActionText next={status.next} />
        </div>
      </section>

      <section data-testid="sdd-index-phases" className={sectionClass}>
        <h2 className="text-xl font-semibold">{t.phases.title}</h2>
        <div role="region" aria-label={t.phases.region} tabIndex={0} className={regionClass}>
          <table className="w-full min-w-[640px] table-fixed text-left">
            <thead>
              <tr>
                <th scope="col" className={`${cellClass} w-[80px]`}>
                  {t.phases.phase}
                </th>
                <th scope="col" className={cellClass}>
                  {t.phases.name}
                </th>
                <th scope="col" className={`${cellClass} w-[120px]`}>
                  {t.phases.done}
                </th>
                <th scope="col" className={`${cellClass} w-[120px]`}>
                  {t.phases.checkpoint}
                </th>
                <th scope="col" className={`${cellClass} w-[200px]`}>
                  {t.phases.checkpointStatus}
                </th>
              </tr>
            </thead>
            <tbody>
              {status.phases.map((p) => (
                <tr key={p.id}>
                  <td className={`${cellClass} font-mono`}>{p.id}</td>
                  <td className={cellClass}>{p.title}</td>
                  <td className={cellClass}>{`${String(p.done)}/${String(p.total)}`}</td>
                  <td className={`${cellClass} font-mono`}>{p.checkpoint}</td>
                  <td className={cellClass}>{t.phases.checkpointStates[p.checkpointStatus]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section data-testid="sdd-index-specs" className={sectionClass}>
        <h2 className="text-xl font-semibold">{t.specs.title}</h2>
        {status.specs.length === 0 ? (
          <p className="mt-4">{t.specs.empty}</p>
        ) : (
          <div role="region" aria-label={t.specs.region} tabIndex={0} className={regionClass}>
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr>
                  <th scope="col" className={cellClass}>
                    {t.specs.id}
                  </th>
                  <th scope="col" className={cellClass}>
                    {t.specs.name}
                  </th>
                  <th scope="col" className={cellClass}>
                    {t.specs.phase}
                  </th>
                  <th scope="col" className={cellClass}>
                    {t.specs.status}
                  </th>
                  <th scope="col" className={cellClass}>
                    {t.specs.dependencies}
                  </th>
                  <th scope="col" className={cellClass}>
                    {t.specs.validations}
                  </th>
                </tr>
              </thead>
              <tbody>
                {status.specs.map((s) => (
                  <tr key={s.id} data-testid={`sdd-spec-${s.id}`}>
                    <td className={`${cellClass} font-mono whitespace-nowrap`}>
                      {Object.hasOwn(sddDemos, s.id) ? (
                        <Link href={`/_dev/sdd/${s.id}`} className="underline">
                          {s.id}
                        </Link>
                      ) : (
                        s.id
                      )}
                    </td>
                    <td className={cellClass}>{s.title}</td>
                    <td className={`${cellClass} font-mono`}>{s.phase}</td>
                    <td className={cellClass}>
                      <span
                        data-testid="sdd-spec-status"
                        className={`inline-block rounded-full px-2 py-0.5 text-sm whitespace-nowrap ${STATUS_STYLE[s.status]}`}
                      >
                        {t.statuses[s.status]}
                      </span>
                      {s.reason === null ? null : <p className="mt-1 text-sm">{s.reason}</p>}
                    </td>
                    <td className={`${cellClass} font-mono text-sm`}>
                      {s.dependsOn.length > 0 ? s.dependsOn.join(', ') : t.specs.none}
                    </td>
                    <td className={`${cellClass} whitespace-nowrap`}>
                      {s.validationsTotal > 0
                        ? `${String(s.validationsPassed)}/${String(s.validationsTotal)}`
                        : t.specs.none}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DemoShell>
  );
}
