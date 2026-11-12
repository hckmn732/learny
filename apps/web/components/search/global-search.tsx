'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import {
  normalizeSearchText,
  type SearchItem,
  type SearchKind,
  type SearchResponse,
} from '@learny/contracts';
import { Icon, cn } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { HighlightedText } from './highlighted-text';

const t = fr.search;
/** CL-3 — typing pause before the request; shorter than a perceptible wait. */
export const SEARCH_DEBOUNCE_MS = 150;

export interface SearchInput {
  query: { q: string };
}

export type SearchFunction = (
  input: SearchInput,
  options?: { signal?: AbortSignal },
) => Promise<SearchResponse>;

const defaultSearch: SearchFunction = (input, options) => api.searchGlobal(input, options);

export interface GlobalSearchProps {
  label?: string;
  placeholder?: string;
  onNavigate: (href: string) => void;
  /** Injectable service for the unit tests; the header uses the typed API client. */
  search?: SearchFunction;
  className?: string;
}

interface FlatOption {
  kind: SearchKind;
  item: SearchItem;
}

type PanelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; query: string; response: SearchResponse }
  | { status: 'error' };

type SearchResultState =
  | { status: 'done'; query: string; attempt: number; response: SearchResponse }
  | { status: 'error'; query: string; attempt: number };

function optionsOf(response: SearchResponse): FlatOption[] {
  return response.groups.flatMap((group) =>
    group.items.map((item) => ({ kind: group.kind, item })),
  );
}

function stateAnnouncement(state: PanelState): ReactNode {
  if (state.status === 'loading') return t.loadingAnnouncement;
  if (state.status === 'error') return t.error;
  if (state.status === 'done') {
    const count = state.response.groups.reduce((sum, group) => sum + group.total, 0);
    return count === 0 ? t.empty(state.query) : t.announcement(count);
  }
  return '';
}

/**
 * Header search combobox (SPEC-307 EF-1, EF-2, EF-4, ET-1, ET-2; BR-NAV-05).
 *
 * From two normalized characters, the SPEC-212 service is queried after a short pause. Each new
 * query aborts the previous request and a sequence number ignores any late answer, so an older
 * response never replaces the recent one. The panel is a non-modal popup anchored under the field
 * (same width, radius and shadow as the notification panel); the input keeps the focus and
 * `aria-activedescendant` tracks the active option. Escape closes the panel without clearing the
 * text, Tab keeps the normal page order, and the form still submits to `/recherche` without
 * JavaScript.
 */
export const GlobalSearch = ({
  label = t.label,
  placeholder = t.placeholder,
  onNavigate,
  search = defaultSearch,
  className,
}: GlobalSearchProps) => {
  const inputId = useId();
  const panelId = useId();
  const listboxId = `${panelId}-listbox`;
  const rootRef = useRef<HTMLFormElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SearchResultState | null>(null);

  const query = normalizeSearchText(value);
  const eligible = Array.from(query).length >= 2;
  // The loading state is derived from the query and the attempt: an old answer never shows while
  // a newer request is pending (EF-4, CA-4).
  let state: PanelState;
  if (!eligible) {
    state = { status: 'idle' };
  } else if (result === null || result.query !== query || result.attempt !== attempt) {
    state = { status: 'loading' };
  } else if (result.status === 'done') {
    state = { status: 'done', query: result.query, response: result.response };
  } else {
    state = { status: 'error' };
  }
  const doneState = state.status === 'done' ? state : null;
  const options = doneState === null ? [] : optionsOf(doneState.response);
  const panelOpen = open && value.trim() !== '';
  const hasResults = doneState !== null && options.length > 0;
  const activeOption = activeIndex === null ? undefined : options[activeIndex];

  useEffect(() => {
    if (!eligible) {
      sequenceRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    sequenceRef.current += 1;
    const sequence = sequenceRef.current;

    const timer = window.setTimeout(() => {
      void search({ query: { q: query } }, { signal: controller.signal })
        .then((response) => {
          if (controller.signal.aborted || sequence !== sequenceRef.current) return;
          setResult({ status: 'done', query, attempt, response });
          setActiveIndex(null);
        })
        .catch(() => {
          if (controller.signal.aborted || sequence !== sequenceRef.current) return;
          setResult({ status: 'error', query, attempt });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, eligible, query, search]);

  useEffect(() => {
    if (!panelOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target) === true) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [panelOpen]);

  const optionId = (index: number) => `${listboxId}-option-${String(index)}`;

  const onChange = (next: string) => {
    setValue(next);
    setResult(null);
    setActiveIndex(null);
    const normalized = normalizeSearchText(next);
    if (Array.from(normalized).length < 2) {
      setOpen(next.trim() !== '');
    } else {
      setOpen(true);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (panelOpen) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(null);
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (event.key === 'ArrowDown') {
          return current === null ? 0 : (current + 1) % options.length;
        }
        return current === null
          ? options.length - 1
          : (current - 1 + options.length) % options.length;
      });
      return;
    }
    if (event.key === 'Home' && options.length > 0) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End' && options.length > 0) {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }
    if (event.key === 'Enter' && panelOpen && activeOption !== undefined) {
      event.preventDefault();
      setOpen(false);
      onNavigate(activeOption.item.href);
    }
  };

  const onBlur = (event: FocusEvent<HTMLFormElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setOpen(false);
  };

  const viewAllHref = `/recherche?q=${encodeURIComponent(query)}`;

  return (
    <form
      ref={rootRef}
      role="search"
      action="/recherche"
      method="get"
      data-testid="header-search"
      className={cn('relative min-w-0 flex-[1_1_320px] max-w-[414px]', className)}
      onBlur={onBlur}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Icon
        name="search"
        size={18}
        strokeWidth={1.8}
        className="pointer-events-none absolute top-12 left-14 text-ink-muted"
      />
      <input
        id={inputId}
        name="q"
        type="search"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={panelOpen}
        aria-controls={hasResults ? listboxId : panelId}
        {...(activeOption === undefined || activeIndex === null
          ? {}
          : { 'aria-activedescendant': optionId(activeIndex) })}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        data-testid="header-search-input"
        className="min-h-42 w-full rounded-12 border border-solid border-border bg-surface pr-14 pl-42 font-sans text-14 text-ink placeholder:text-ink-muted"
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        onFocus={() => {
          if (value.trim() !== '') setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />

      <p data-testid="search-live" role="status" aria-live="polite" className="sr-only">
        {stateAnnouncement(state)}
      </p>

      <div
        id={panelId}
        role="dialog"
        aria-label={t.suggestionsLabel}
        data-testid="search-suggestions"
        className={cn(
          'absolute top-[54px] left-0 z-popover box-border max-h-[min(420px,calc(100vh-200px))] w-[400px] max-w-[calc(100vw-32px)] flex-col overflow-y-auto rounded-20 border border-solid border-border bg-surface shadow-popover',
          panelOpen ? 'flex' : 'hidden',
        )}
      >
        {state.status === 'idle' ? (
          <p
            data-testid="search-state-idle"
            className="m-0 px-16 py-20 text-14 leading-1.5 text-ink-muted"
          >
            {t.shortHint}
          </p>
        ) : null}

        {state.status === 'loading' ? (
          <p data-testid="search-state-loading" className="m-0 px-16 py-20 text-14 text-ink-muted">
            {t.loading}
          </p>
        ) : null}

        {state.status === 'error' ? (
          <div role="alert" data-testid="search-state-error" className="flex flex-col gap-10 p-16">
            <p className="m-0 text-14 leading-1.5 text-ink-secondary">{t.error}</p>
            <button
              type="button"
              data-testid="search-retry"
              className="min-h-36 w-fit cursor-pointer rounded-10 border border-solid border-border-strong bg-surface px-12 text-13 font-600 text-ink"
              onClick={() => {
                setAttempt((current) => current + 1);
              }}
            >
              {t.retry}
            </button>
          </div>
        ) : null}

        {state.status === 'done' && options.length === 0 ? (
          <p
            data-testid="search-state-empty"
            className="m-0 px-16 py-20 text-14 leading-1.5 text-ink-muted"
          >
            {t.empty(state.query)}
          </p>
        ) : null}

        {doneState !== null && options.length > 0 ? (
          <div className="flex flex-col">
            <div
              id={listboxId}
              role="listbox"
              aria-label={t.resultsLabel}
              className="flex flex-col gap-2 p-6"
            >
              {doneState.response.groups.map((group) => {
                const labelId = `${listboxId}-group-${group.kind}`;
                return (
                  <div
                    key={group.kind}
                    role="group"
                    aria-labelledby={labelId}
                    className="flex flex-col gap-2"
                  >
                    <p
                      id={labelId}
                      data-testid={`search-group-${group.kind}`}
                      className="m-0 flex items-baseline justify-between gap-8 px-10 py-4 text-11 font-600 tracking-wide text-ink-muted uppercase"
                    >
                      <span>{group.label}</span>
                      <span className="normal-case">{t.resultCount(group.total)}</span>
                    </p>
                    {group.items.map((item) => {
                      const index = options.findIndex(
                        (option) => option.kind === group.kind && option.item.id === item.id,
                      );
                      const selected = activeIndex === index;
                      return (
                        <a
                          key={item.id}
                          id={optionId(index)}
                          role="option"
                          aria-selected={selected}
                          tabIndex={-1}
                          href={item.href}
                          data-testid="search-option"
                          data-kind={group.kind}
                          className={cn(
                            'flex min-w-0 flex-col gap-3 rounded-14 px-10 py-8 no-underline',
                            selected
                              ? 'bg-surface-muted text-ink'
                              : 'text-ink hover:bg-surface-subtle',
                          )}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onMouseEnter={() => {
                            setActiveIndex(index);
                          }}
                        >
                          <span
                            data-testid="search-option-title"
                            className="text-14 font-700 break-words"
                          >
                            <HighlightedText text={item.title} highlights={item.titleHighlights} />
                          </span>
                          <span
                            data-testid="search-option-snippet"
                            className="text-13 leading-1.45 break-words text-ink-secondary"
                          >
                            <HighlightedText text={item.snippet} highlights={item.highlights} />
                          </span>
                        </a>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <a
              data-testid="search-view-all"
              href={viewAllHref}
              className="mx-6 mt-2 mb-6 flex min-h-38 items-center justify-center rounded-12 border border-solid border-border bg-surface-subtle px-12 text-13 font-600 text-ink no-underline"
            >
              {t.viewAll}
            </a>
          </div>
        ) : null}
      </div>
    </form>
  );
};
