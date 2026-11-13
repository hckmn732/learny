'use client';

import { useActionState, useState } from 'react';

import type { SearchWebProvider } from '@learny/contracts';

import {
  decideSuggestion,
  suggestFromSearch,
  type SuggestionState,
} from '../../app/%5Fdev/sdd/spec-512-actions';
import type { RouteDemo, SearchWebDemo } from '../../app/%5Fdev/sdd/spec-512-data';
import { BaseCard } from '../sdd/base-tokens';

const INITIAL: SuggestionState = { status: 'idle', id: null, message: '' };

const ROUTES: { value: SearchWebProvider; label: string }[] = [
  { value: 'anthropic', label: 'Recherche native Anthropic' },
  { value: 'tavily', label: 'Repli Tavily' },
];

function RouteResults({
  route,
  onSuggest,
  pending,
}: Readonly<{ route: RouteDemo; onSuggest: (formData: FormData) => void; pending: boolean }>) {
  if (route.results.length === 0) {
    return (
      <p data-testid="search-web-empty" className="text-13 text-ink-secondary">
        {route.message ?? 'Aucun résultat.'}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {route.results.map((result, index) => (
        <li
          key={result.url}
          data-testid="search-result"
          data-provider={result.provider}
          className="rounded-12 border border-solid border-border p-4"
        >
          <form action={onSuggest} className="flex flex-col gap-2">
            <input type="hidden" name="title" value={result.title} />
            <input type="hidden" name="url" value={result.url} />
            <input
              type="hidden"
              name="reason"
              value={`Résultat de recherche pour « ${result.title} ».`}
            />
            <p className="font-semibold text-15">{result.title}</p>
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer noopener"
              className="break-all text-12 underline"
              data-testid="search-result-url"
            >
              {result.url}
            </a>
            <p className="text-13 text-ink-secondary">{result.snippet}</p>
            <p className="font-mono text-12">
              <span data-testid="search-result-provider">{result.provider}</span>
              {result.publishedAt === undefined ? '' : ` · ${result.publishedAt}`}
            </p>
            <button
              type="submit"
              data-testid={
                index === 0 ? 'search-result-suggest' : `search-result-suggest-${String(index)}`
              }
              disabled={pending}
              className="self-start rounded-12 bg-ink px-4 py-2 text-13 text-white disabled:opacity-50"
            >
              Suggérer pour ce chapitre
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export function Spec512Client({ data }: Readonly<{ data: SearchWebDemo }>) {
  const [route, setRoute] = useState<SearchWebProvider>('anthropic');
  const [suggestState, suggestAction, suggestPending] = useActionState(suggestFromSearch, INITIAL);
  const [decideState, decideAction, decidePending] = useActionState(decideSuggestion, INITIAL);
  const state = decideState.status === 'idle' ? suggestState : decideState;
  const busy = suggestPending || decidePending;
  const selected = data.routes[route];

  return (
    <>
      <BaseCard testId="search-web-programme" title="Tâche programme — résultats simulés">
        <div role="group" aria-label="Route fournisseur simulée" className="flex flex-wrap gap-2">
          {ROUTES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={route === entry.value}
              data-testid={`search-route-${entry.value}`}
              onClick={() => {
                setRoute(entry.value);
              }}
              className={`rounded-12 border border-solid border-border px-4 py-2 text-13 ${
                route === entry.value ? 'bg-ink text-white' : 'bg-surface'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="mt-4 text-13">
          Fournisseur affiché :{' '}
          <strong data-testid="search-web-provider">{selected.provider}</strong> · schéma unique{' '}
          {'{title,url,snippet,publishedAt?,provider}'} · {selected.results.length} résultat(s)
          {selected.limited ? ' (texte coupé au budget)' : ''}.
        </p>
        <div className="mt-4">
          <RouteResults route={selected} onSuggest={suggestAction} pending={busy} />
        </div>
        <div
          role="status"
          data-testid="search-web-suggestion-status"
          className="mt-4 rounded-12 bg-canvas p-4 text-13"
        >
          {state.status === 'idle' ? 'Aucune suggestion pour l’instant.' : state.message}
        </div>
        {state.status === 'pending' && state.id !== null ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={decideAction}>
              <input type="hidden" name="id" value={state.id} />
              <input type="hidden" name="decision" value="import" />
              <button
                type="submit"
                data-testid="search-web-suggestion-import"
                disabled={busy}
                className="rounded-12 bg-ink px-4 py-2 text-13 text-white disabled:opacity-50"
              >
                Importer la suggestion
              </button>
            </form>
            <form action={decideAction}>
              <input type="hidden" name="id" value={state.id} />
              <input type="hidden" name="decision" value="dismiss" />
              <button
                type="submit"
                data-testid="search-web-suggestion-dismiss"
                disabled={busy}
                className="rounded-12 border border-solid border-border px-4 py-2 text-13 disabled:opacity-50"
              >
                Ignorer
              </button>
            </form>
          </div>
        ) : null}
        <p className="mt-3 text-12 text-ink-secondary">
          Aucun résultat n’est inséré dans un cours. Une ressource n’entre dans le chapitre que par
          l’import explicite de l’apprenant.
        </p>
      </BaseCard>

      <BaseCard testId="search-web-refusal" title="Tâche cours — refus avant tout appel">
        <p className="text-13">
          Code : <strong data-testid="search-web-refusal-code">{data.refusal.code}</strong>
        </p>
        <p data-testid="search-web-refusal-message" className="mt-2 text-13 text-ink-secondary">
          {data.refusal.message}
        </p>
        <p data-testid="search-web-refusal-note" className="mt-2 text-13">
          Aucun appel fournisseur n’a été effectué et aucun bouton d’import n’est proposé.
        </p>
      </BaseCard>

      <BaseCard testId="search-web-contract" title="Contrat d’entrée, résultat validé et échec">
        <h3 className="font-semibold text-15">Contrat d’entrée (Zod)</h3>
        <div
          role="region"
          aria-label="Contrat d’entrée de la recherche web"
          tabIndex={0}
          className="mt-2 overflow-x-auto rounded-12 bg-canvas p-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <pre data-testid="search-web-input-contract" className="text-12">
            {JSON.stringify(data.input, null, 2)}
          </pre>
        </div>
        <h3 className="mt-4 font-semibold text-15">Résultat validé (route native)</h3>
        <div
          role="region"
          aria-label="Résultat validé de la recherche web"
          tabIndex={0}
          className="mt-2 max-h-96 overflow-auto rounded-12 bg-canvas p-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <pre data-testid="search-web-validated-output" className="text-12">
            {JSON.stringify(data.validated, null, 2)}
          </pre>
        </div>
        <h3 className="mt-4 font-semibold text-15">Échec lisible — fournisseur indisponible</h3>
        <p className="mt-2 font-mono text-13" data-testid="search-web-unavailable">
          {data.unavailable.code} · {data.unavailable.message}
        </p>
        <p className="mt-2 text-12 text-ink-secondary">
          Aucune source inventée, aucune bascule payante automatique.
        </p>
      </BaseCard>
    </>
  );
}
