'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

import type { GapCountsByNature, GapNature } from '@learny/contracts';
import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.gaps.filters;

const NATURES: readonly GapNature[] = [
  'confusion',
  'misunderstanding',
  'application',
  'forgetting',
] as const;

const NATURE_LABEL: Record<GapNature, string> = {
  forgetting: t.forgetting,
  confusion: t.confusion,
  misunderstanding: t.misunderstanding,
  application: t.application,
};

type FilterKey = 'all' | GapNature;

export interface GapFiltersProps {
  countsByNature: GapCountsByNature;
  activeNature: GapNature | null;
}

function pathFor(pathname: string, nature: GapNature | null): string {
  if (nature === null) return pathname;
  return `${pathname}?nature=${encodeURIComponent(nature)}`;
}

/**
 * URL-backed nature filters of SCR-13 (EF-2, CL-4): the active filter lives in `?nature=`, the
 * counters always describe all open gaps, and each control is a real button so Enter and Space
 * work without any pointer. `aria-pressed` carries the selected state, never colour alone.
 */
export function GapFilters({ countsByNature, activeNature }: GapFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const total = NATURES.reduce((sum, nature) => sum + countsByNature[nature], 0);

  const select = (nature: GapNature | null) => {
    startTransition(() => {
      router.push(pathFor(pathname, nature), { scroll: false });
    });
  };

  const options: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: t.all, count: total },
    ...NATURES.map((nature) => ({
      key: nature,
      label: NATURE_LABEL[nature],
      count: countsByNature[nature],
    })),
  ];

  return (
    <div
      data-testid="gaps-filter"
      role="group"
      aria-label={t.label}
      aria-busy={pending || undefined}
      className="flex flex-wrap gap-8"
    >
      {options.map((option) => {
        const active = option.key === 'all' ? activeNature === null : activeNature === option.key;
        return (
          <button
            key={option.key}
            type="button"
            data-testid={`gaps-filter-${option.key}`}
            aria-pressed={active}
            aria-label={`${option.label} ${String(option.count)} ${option.count === 1 ? 'lacune' : 'lacunes'}`}
            onClick={() => {
              select(option.key === 'all' ? null : option.key);
            }}
            className={cn(
              'inline-flex min-h-40 cursor-pointer items-center gap-8 rounded-full px-14 text-14 transition-colors',
              active
                ? 'border-0 bg-ink font-700 text-white'
                : 'border border-solid border-border-strong bg-surface font-500 text-ink hover:border-ink',
            )}
          >
            <span>{option.label}</span>{' '}
            <span
              data-testid={`gaps-filter-count-${option.key}`}
              className={cn(
                'min-w-20 rounded-full px-6 py-1 text-12 font-700',
                active ? 'bg-lime text-ink' : 'bg-canvas text-ink-secondary',
              )}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
