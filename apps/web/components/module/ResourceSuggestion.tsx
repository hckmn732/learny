'use client';

import type { ResourceSuggestionItem } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.module;

export interface ResourceSuggestionProps {
  suggestions: readonly ResourceSuggestionItem[];
  onImport: (id: string) => void;
  onDismiss: (id: string) => void;
  busyId?: string | null;
}

/**
 * BR-APP-05 — tutor suggestions of the selected chapter. Importing is a learner action that creates
 * one contribution; ignoring creates none. The reason of the tutor is always visible, and the URL
 * is a link the learner can inspect, never an automatic download.
 */
export function ResourceSuggestion({
  suggestions,
  onImport,
  onDismiss,
  busyId = null,
}: ResourceSuggestionProps) {
  if (suggestions.length === 0) return null;
  return (
    <section aria-labelledby="t-suggestions" className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h3 className="m-0 font-display text-16 font-600" id="t-suggestions">
          {t.suggestionsTitle}
        </h3>
        <p className="m-0 text-13 text-ink-muted">{t.suggestionsIntro}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-8 p-0" data-testid="resource-suggestions">
        {suggestions.map((suggestion) => {
          const busy = busyId === suggestion.id;
          return (
            <li
              className="flex flex-wrap items-center gap-12 rounded-18 border border-border bg-surface-subtle px-14 py-12"
              data-testid="resource-suggestion"
              key={suggestion.id}
            >
              <span className="flex min-w-0 flex-1 basis-260 flex-col gap-2">
                <span className="text-14 font-600">{suggestion.title}</span>
                <a
                  className="break-all text-13"
                  href={suggestion.url}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  {suggestion.url}
                </a>
                <span className="text-13 text-ink-muted">{suggestion.reason}</span>
              </span>
              <span className="flex gap-8">
                <button
                  className="inline-flex min-h-36 cursor-pointer items-center rounded-10 bg-ink px-12 text-13 font-700 text-white"
                  disabled={busy}
                  onClick={() => {
                    onImport(suggestion.id);
                  }}
                  type="button"
                >
                  {busy ? t.busy : t.import}
                </button>
                <button
                  className="inline-flex min-h-36 cursor-pointer items-center rounded-10 border border-border-strong bg-surface px-12 text-13 font-600 text-ink"
                  disabled={busy}
                  onClick={() => {
                    onDismiss(suggestion.id);
                  }}
                  type="button"
                >
                  {t.dismiss}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
