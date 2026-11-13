'use client';

import { Check, Search } from 'lucide-react';
import { useState, type KeyboardEvent, type SyntheticEvent } from 'react';

import type { NotionGraphNode } from '@learny/contracts';
import { cn } from '@learny/ui';

import type { GraphFilters } from '../../lib/notion-graph/pan-zoom';
import { fr } from '../../messages/fr';

const t = fr.notionGraph;

const FILTERS: ReadonlyArray<{ key: keyof GraphFilters; label: string; testId: string }> = [
  { key: 'modules', label: t.filters.modules, testId: 'graph-filter-modules' },
  { key: 'upcoming', label: t.filters.upcoming, testId: 'graph-filter-upcoming' },
  { key: 'sources', label: t.filters.sources, testId: 'graph-filter-sources' },
];

export interface GraphToolbarProps {
  query: string;
  results: readonly NotionGraphNode[];
  filters: GraphFilters;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onPick: (node: NotionGraphNode) => void;
  onToggleFilter: (key: keyof GraphFilters) => void;
}

/**
 * Search and filters of SCR-14 (SPEC-616 BR-CAR-03, EF-2, EF-3). Enter selects and centres the
 * first match; every filter is a pressed button whose label stays textual, and the search field
 * remains the only tab stop until results are shown.
 */
export function GraphToolbar({
  query,
  results,
  filters,
  onQueryChange,
  onSubmit,
  onPick,
  onToggleFilter,
}: GraphToolbarProps) {
  const [focused, setFocused] = useState(false);
  const open = focused && query.trim() !== '';
  const listId = 'graph-search-results';

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      onQueryChange('');
      setFocused(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-10">
      <form
        role="search"
        aria-label={t.search.label}
        onSubmit={submit}
        className="relative min-w-0 flex-[1_1_280px] max-w-[420px]"
      >
        <label htmlFor="recherche-notion" className="sr-only">
          {t.search.label}
        </label>
        <Search
          aria-hidden="true"
          size={16}
          strokeWidth={2}
          className="pointer-events-none absolute top-13 left-13 text-ink-muted"
        />
        <input
          id="recherche-notion"
          data-testid="graph-search"
          type="search"
          autoComplete="off"
          value={query}
          placeholder={t.search.placeholder}
          {...(open ? { 'aria-controls': listId } : {})}
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          onKeyDown={onKeyDown}
          className="min-h-42 w-full rounded-12 border border-solid border-border bg-surface py-0 pr-12 pl-38 text-14 text-ink"
        />
        {open ? (
          <div className="absolute top-48 right-0 left-0 z-20 rounded-14 border border-solid border-border bg-surface p-6 shadow-float">
            {results.length === 0 ? (
              <p className="m-0 px-10 py-8 text-13 text-ink-muted">{t.search.noResults}</p>
            ) : (
              <ul
                id={listId}
                aria-label={t.search.resultsLabel}
                data-testid="graph-search-results"
                className="m-0 flex list-none flex-col gap-2 p-0"
              >
                {results.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      data-testid="graph-search-result"
                      onMouseDown={(event) => {
                        // Keep the input from blurring before the click is handled.
                        event.preventDefault();
                      }}
                      onClick={() => {
                        onPick(node);
                        setFocused(false);
                      }}
                      className="flex min-h-38 w-full cursor-pointer items-center gap-10 rounded-9 border-0 bg-transparent px-10 text-left text-14 text-ink hover:bg-canvas"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-flex size-8 flex-none rounded-full bg-ink-muted"
                      />
                      <span className="min-w-0 flex-1 truncate">{node.label}</span>
                      <span className="text-12 text-ink-muted">
                        {node.kind === 'notion'
                          ? `Module ${String(node.modulePosition ?? 0)}`
                          : node.kind === 'module'
                            ? 'Module'
                            : 'Apport'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </form>

      <div
        role="group"
        aria-label={t.filters.label}
        className="flex max-w-[300px] flex-wrap gap-6 shell:max-w-none"
      >
        {FILTERS.map((filter) => {
          const pressed = filters[filter.key];
          return (
            <button
              key={filter.testId}
              type="button"
              data-testid={filter.testId}
              aria-pressed={pressed}
              onClick={() => {
                onToggleFilter(filter.key);
              }}
              className={cn(
                'inline-flex min-h-36 cursor-pointer items-center gap-6 rounded-full px-12 text-13',
                pressed
                  ? 'border border-solid border-ink bg-ink font-600 text-white'
                  : 'border border-solid border-border-strong bg-surface font-500 text-ink-muted',
              )}
            >
              <span
                aria-hidden="true"
                className={cn('inline-block w-12 text-12', !pressed && 'invisible')}
              >
                <Check size={12} strokeWidth={3} />
              </span>
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
