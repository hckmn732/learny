'use client';

import type { ProgrammeProposalDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

import { formatDay, formatLongDate, weeksBetween } from './dates';

const t = fr.programme;

function StatCard({ big, small, dark = false }: { big: string; small: string; dark?: boolean }) {
  return (
    <div
      className={
        dark
          ? 'flex flex-1 basis-200 flex-col gap-4 rounded-22 bg-ink p-20 text-white'
          : 'flex flex-1 basis-200 flex-col gap-4 rounded-22 border border-border bg-surface p-20'
      }
    >
      <span
        className={
          dark
            ? 'font-display text-34 font-600 text-lime'
            : 'font-display text-34 font-600 text-ink'
        }
      >
        {big}
      </span>
      <span className={dark ? 'text-13 text-on-dark-secondary' : 'text-13 text-ink-muted'}>
        {small}
      </span>
    </div>
  );
}

export interface ProposalHeaderProps {
  proposal: ProgrammeProposalDto;
  isCurrent: boolean;
  onAdjust: () => void;
  onValidate: () => void;
}

export function ProposalHeader({ proposal, isCurrent, onAdjust, onValidate }: ProposalHeaderProps) {
  const first = proposal.modules[0];
  const last = proposal.modules.at(-1);
  const from = first?.plannedStart ?? '';
  const to = last?.plannedEnd ?? '';
  const weeks = from === '' || to === '' ? 1 : weeksBetween(from, to);
  const chapters = proposal.modules.reduce((count, module) => count + module.chapters.length, 0);
  const threshold = first?.threshold ?? 80;
  const active = proposal.proposalStatus === 'active';

  return (
    <div className="flex flex-col gap-24" data-testid="programme-summary">
      <div className="flex flex-wrap items-end justify-between gap-16">
        <div className="flex flex-1 basis-420 flex-col gap-8">
          <div className="flex flex-wrap items-center gap-8 text-13">
            <a className="font-600" href={`/formations/${proposal.formationId}/cadrage`}>
              {t.breadcrumb}
            </a>
            <span aria-hidden="true" className="text-ink-muted">
              /
            </span>
            <span className="rounded-full bg-ink px-10 py-4 font-600 text-white">
              {active ? t.activeBadge : t.step}
            </span>
            <span
              className="rounded-full bg-indigo-soft px-10 py-4 font-700 text-indigo-ink-strong"
              data-testid="programme-source"
            >
              {proposal.source === 'imported' ? t.sourceImported : t.sourceGenerated}
            </span>
          </div>
          <h1 className="m-0 font-display text-34 font-600 tracking-title">{proposal.title}</h1>
          <p className="m-0 max-w-[680px] text-15 leading-1.5 text-ink-muted">
            {proposal.description ?? proposal.summary ?? ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-8">
          {active ? (
            <a
              className="inline-flex min-h-48 items-center rounded-14 bg-ink px-22 text-15 font-700 text-white"
              href={`/formations/${proposal.formationId}/programme`}
            >
              {t.openModule}
            </a>
          ) : (
            <>
              <button
                className="min-h-48 cursor-pointer rounded-14 border border-border-strong bg-surface px-18 font-600 text-ink"
                data-testid="programme-adjust"
                onClick={onAdjust}
                type="button"
              >
                {t.adjust}
              </button>
              <button
                className="min-h-48 cursor-pointer rounded-14 bg-ink px-22 text-15 font-700 text-white disabled:cursor-not-allowed disabled:opacity-45"
                aria-disabled={!isCurrent}
                data-testid="programme-validate"
                disabled={!isCurrent}
                onClick={onValidate}
                type="button"
              >
                {t.validate}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-12">
        <StatCard big={`${String(proposal.volumeHours ?? 0)} h`} dark small={t.statsHours} />
        <StatCard
          big={t.statsWeeks(weeks)}
          small={from === '' || to === '' ? '' : t.statsDates(formatDay(from), formatLongDate(to))}
        />
        <StatCard big={t.statsModules(proposal.modules.length)} small={t.statsChapters(chapters)} />
        <StatCard big={`${String(threshold)} %`} small={t.statsThreshold} />
      </div>
    </div>
  );
}
