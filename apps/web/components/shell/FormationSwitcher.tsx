'use client';

import { useState } from 'react';

import type { SidebarFormation } from '@learny/contracts';
import {
  Button,
  Icon,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ProgressBar,
  cn,
  iconRegistry,
} from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.shell.sidebar.formationManagement;

/** ADR-0162 — sigil palette shared with the sidebar card. */
const ACCENT_CLASS = {
  indigo: 'bg-indigo-soft text-indigo-ink',
  green: 'bg-green-soft text-green-ink-alt',
  orange: 'bg-orange-soft text-orange-ink-strong',
  violet: 'bg-violet-soft text-violet-ink',
  teal: 'bg-green-soft text-green-ink',
} as const;

export interface FormationSwitcherProps {
  formations: readonly SidebarFormation[];
  currentId: string | null;
  onSelect: (formation: SidebarFormation) => void;
  onPause?: (formation: SidebarFormation) => void;
  onResume?: (formation: SidebarFormation) => void;
  onArchive?: (formation: SidebarFormation) => void;
  /** One transition at a time: the buttons of the pending formation are disabled. */
  pendingId?: string | null;
  disabled?: boolean;
}

interface FormationRowProps {
  formation: SidebarFormation;
  current: boolean;
  pending: boolean;
  onSelect: (formation: SidebarFormation) => void;
  onPause?: (formation: SidebarFormation) => void;
  onResume?: (formation: SidebarFormation) => void;
  onArchive?: (formation: SidebarFormation) => void;
}

function FormationRow({
  formation,
  current,
  pending,
  onSelect,
  onPause,
  onResume,
  onArchive,
}: FormationRowProps) {
  const pause = formation.status === 'active';
  return (
    <li
      data-testid={`formation-row-${formation.id}`}
      data-status={formation.status}
      className={cn(
        'flex flex-col gap-6 rounded-14 border border-solid p-10',
        current ? 'border-ink bg-surface-subtle' : 'border-border bg-surface',
      )}
    >
      <button
        type="button"
        data-testid={`sidebar-formation-option-${formation.id}`}
        aria-current={current ? 'true' : undefined}
        aria-label={t.select(formation.title)}
        onClick={() => {
          onSelect(formation);
        }}
        className="flex min-h-36 w-full items-center gap-10 rounded-10 text-left outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-32 shrink-0 items-center justify-center rounded-9 font-display text-11 font-700',
            ACCENT_CLASS[formation.accent],
          )}
        >
          {formation.monogram}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="truncate text-14 font-700 text-ink">{formation.title}</span>
          <span className="flex items-center gap-6 text-12 text-ink-muted">
            {pause ? null : <span className="font-600 text-orange-ink-strong">{t.paused}</span>}
            <span>
              Module {formation.currentModulePosition ?? 0} sur {formation.moduleCount}
            </span>
          </span>
          <ProgressBar
            value={formation.progressPercent}
            tone="lime"
            size="sm"
            decorative
            className="mt-2"
          />
        </span>
        {current ? (
          <span className="flex shrink-0 items-center gap-4 text-11 font-600 text-ink">
            <Icon name="check-circle" size={16} />
            <span className="sr-only">{t.current}</span>
          </span>
        ) : null}
      </button>
      <div className="flex flex-wrap items-center gap-6">
        {pause ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="formation-pause"
            data-formation-id={formation.id}
            aria-label={t.pauseLabel(formation.title)}
            disabled={pending}
            onClick={() => {
              onPause?.(formation);
            }}
          >
            {t.pause}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="dark"
            data-testid="formation-resume"
            data-formation-id={formation.id}
            aria-label={t.resumeLabel(formation.title)}
            disabled={pending}
            onClick={() => {
              onResume?.(formation);
            }}
          >
            {t.resume}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="formation-archive"
          data-formation-id={formation.id}
          aria-label={t.archiveLabel(formation.title)}
          disabled={pending}
          onClick={() => {
            onArchive?.(formation);
          }}
        >
          {t.archive}
        </Button>
      </div>
    </li>
  );
}

/**
 * SPEC-618 EF-1 — “Changer de formation” lists active and paused formations in two sections,
 * marks the current one and exposes the pause, resume and archive actions. The current formation
 * stays the last active one consulted: a paused row is resumed before it can become current.
 */
export const FormationSwitcher = ({
  formations,
  currentId,
  onSelect,
  onPause,
  onResume,
  onArchive,
  pendingId = null,
  disabled = false,
}: FormationSwitcherProps) => {
  const [open, setOpen] = useState(false);
  const active = formations.filter((formation) => formation.status === 'active');
  const paused = formations.filter((formation) => formation.status === 'paused');

  const run = (action?: (formation: SidebarFormation) => void, formation?: SidebarFormation) => {
    if (formation === undefined) return;
    setOpen(false);
    action?.(formation);
  };

  return (
    <span data-testid="formation-switcher" className="inline-flex">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <IconButton
            tone="dark"
            size="xs"
            label={t.changeFormation}
            icon={iconRegistry['switch-formation']}
            data-testid="sidebar-switch-formation"
            disabled={disabled}
            aria-expanded={open}
          />
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          width={360}
          data-testid="sidebar-formation-menu"
          aria-label={t.dialogTitle}
          className="max-h-[min(560px,calc(100dvh-32px))] overflow-y-auto p-16"
        >
          <h2 id="formation-switcher-title" className="m-0 text-20 font-600 font-display">
            {t.dialogTitle}
          </h2>
          <p className="mt-4 mb-0 text-13 leading-1.45 text-ink-muted">{t.dialogDescription}</p>

          <section aria-labelledby="formation-active-title" className="mt-14">
            <h3
              id="formation-active-title"
              className="m-0 text-11 font-600 uppercase tracking-eyebrow text-ink-muted"
            >
              {t.activeSection(active.length)}
            </h3>
            {active.length === 0 ? (
              <p className="mt-6 mb-0 text-13 text-ink-muted">{t.emptyActive}</p>
            ) : (
              <ul className="m-0 mt-6 flex list-none flex-col gap-6 p-0">
                {active.map((formation) => (
                  <FormationRow
                    key={formation.id}
                    formation={formation}
                    current={formation.id === currentId}
                    pending={pendingId === formation.id}
                    onSelect={(selected) => {
                      run(onSelect, selected);
                    }}
                    onPause={(selected) => {
                      run(onPause, selected);
                    }}
                    onArchive={(selected) => {
                      run(onArchive, selected);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="formation-paused-title" className="mt-14">
            <h3
              id="formation-paused-title"
              className="m-0 text-11 font-600 uppercase tracking-eyebrow text-ink-muted"
            >
              {t.pausedSection(paused.length)}
            </h3>
            {paused.length === 0 ? (
              <p className="mt-6 mb-0 text-13 text-ink-muted">{t.emptyActive}</p>
            ) : (
              <ul className="m-0 mt-6 flex list-none flex-col gap-6 p-0">
                {paused.map((formation) => (
                  <FormationRow
                    key={formation.id}
                    formation={formation}
                    current={false}
                    pending={pendingId === formation.id}
                    onSelect={(selected) => {
                      run(onSelect, selected);
                    }}
                    onResume={(selected) => {
                      run(onResume, selected);
                    }}
                    onArchive={(selected) => {
                      run(onArchive, selected);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        </PopoverContent>
      </Popover>
    </span>
  );
};
