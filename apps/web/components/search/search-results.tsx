// Results of the global search (SPEC-307 EF-3, EF-5, ET-3; BR-NAV-05).
//
// Everything here is presentational: titles, snippets and highlight ranges come from the shared
// SPEC-212 contract. A highlight wraps plain text in <mark>; no string is ever injected as HTML.
import type { SearchGroup, SearchItem, SearchKind, SearchResponse } from '@learny/contracts';
import { PageHeader } from '@learny/ui';

import type { SearchPageState } from '../../lib/search-data';
import { fr } from '../../messages/fr';

import { HighlightedText } from './highlighted-text';

const t = fr.search;

interface SearchResultItemProps {
  kind: SearchKind;
  item: SearchItem;
  testId?: string;
}

export const SearchResultItem = ({
  kind,
  item,
  testId = 'search-page-item',
}: SearchResultItemProps) => (
  <article
    data-testid={testId}
    data-kind={kind}
    className="min-w-0 rounded-24 border border-solid border-border bg-surface py-20 px-20 shell:px-24"
  >
    <p className="m-0 mb-6 flex items-center gap-8">
      <span
        data-testid={`${testId}-type`}
        className="inline-flex items-center rounded-full bg-indigo-soft px-10 py-2 text-11 font-700 tracking-wide text-indigo-ink uppercase"
      >
        {t.types[kind]}
      </span>
    </p>
    <h3 className="m-0 text-18 font-600 break-words">
      <a
        data-testid={`${testId}-link`}
        href={item.href}
        className="rounded-4 text-ink no-underline hover:text-indigo-ink hover:underline"
      >
        <HighlightedText text={item.title} highlights={item.titleHighlights} />
      </a>
    </h3>
    <p
      data-testid={`${testId}-snippet`}
      className="m-0 mt-8 text-14 leading-1.55 break-words text-ink-secondary"
    >
      <span className="sr-only">{t.page.snippetLabel} : </span>
      <HighlightedText text={item.snippet} highlights={item.highlights} />
    </p>
  </article>
);

export const SearchGroupSection = ({ group }: { group: SearchGroup }) => {
  const headingId = `search-group-${group.kind}`;
  return (
    <section
      data-testid={`search-page-group-${group.kind}`}
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-12"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-16 gap-y-4">
        <h2
          id={headingId}
          data-testid={`search-page-group-title-${group.kind}`}
          className="m-0 text-22 font-600 font-display tracking-heading text-ink"
        >
          {group.label}
        </h2>
        <p
          data-testid={`search-page-group-total-${group.kind}`}
          className="m-0 text-13 text-ink-muted"
        >
          {t.page.groupTotal(group.items.length, group.total)}
        </p>
      </div>
      <div className="grid gap-12">
        {group.items.map((item) => (
          <SearchResultItem key={item.id} kind={group.kind} item={item} />
        ))}
      </div>
    </section>
  );
};

export const SearchResultsView = ({ response }: { response: SearchResponse }) => (
  <div data-testid="search-page-results" className="flex flex-col gap-24">
    {response.groups.map((group) => (
      <SearchGroupSection key={group.kind} group={group} />
    ))}
  </div>
);

function retryHref(query: string): string {
  return query === '' ? '/recherche' : `/recherche?q=${encodeURIComponent(query)}`;
}

const stateCardClass =
  'rounded-24 border border-solid border-border bg-surface py-28 px-24 shell:px-28';

export const SearchPageView = ({ state }: { state: SearchPageState }) => (
  <>
    <PageHeader data-testid="search-page-header" eyebrow={t.page.eyebrow} title={t.page.title} />
    <div className="mt-20 flex flex-col gap-20">
      {state.query === '' ? null : (
        <p data-testid="search-page-query" className="m-0 text-15 font-600 text-ink-secondary">
          {t.page.query(state.query)}
        </p>
      )}

      {state.status === 'short' ? (
        <section data-testid="search-page-short" className={stateCardClass}>
          <h2 className="m-0 text-22 font-600 font-display tracking-heading">
            {t.page.shortTitle}
          </h2>
          <p className="m-0 mt-8 max-w-[640px] text-15 leading-1.55 text-ink-muted">
            {t.page.shortDescription}
          </p>
        </section>
      ) : null}

      {state.status === 'error' ? (
        <section role="alert" data-testid="search-page-error" className={stateCardClass}>
          <h2 className="m-0 text-22 font-600 font-display tracking-heading">
            {t.page.errorTitle}
          </h2>
          <p className="m-0 mt-8 max-w-[640px] text-15 leading-1.55 text-ink-muted">
            {state.message ?? t.page.errorDescription}
          </p>
          <a
            data-testid="search-page-retry"
            href={retryHref(state.query)}
            className="mt-12 inline-flex min-h-38 items-center rounded-12 border border-solid border-border-strong px-16 text-14 font-600 text-ink no-underline"
          >
            {t.page.retry}
          </a>
        </section>
      ) : null}

      {state.status === 'done' ? (
        <>
          <p data-testid="search-page-total" className="m-0 text-14 text-ink-muted">
            {t.page.total(state.total)}
          </p>
          {state.total === 0 ? (
            <section data-testid="search-page-empty" className={stateCardClass}>
              <h2 className="m-0 text-22 font-600 font-display tracking-heading">
                {t.page.emptyTitle}
              </h2>
              <p className="m-0 mt-8 max-w-[640px] text-15 leading-1.55 text-ink-muted">
                {t.page.emptyDescription(state.query)}
              </p>
            </section>
          ) : (
            <SearchResultsView response={state.response} />
          )}
        </>
      ) : null}
    </div>
  </>
);
