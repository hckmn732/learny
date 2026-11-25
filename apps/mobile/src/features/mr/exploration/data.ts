// Données des écrans d'exploration (zone D du rattrapage mobile) : lacunes, carte des notions,
// recherche globale.
//
// Une clé de requête par lecture, sous les préfixes déjà déclarés par `src/data/keys.ts`
// (`gaps`, `formation`) : les invalidations du reste de l'application continuent donc de
// fonctionner sans que cette zone touche au cache partagé. Les écrans ne construisent jamais de
// client : `requireApiClient()` reste la seule porte vers l'API.
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { GapListDto, GapNature, NotionGraphDto, SearchResponse } from '@learny/contracts';

import { requireApiClient } from '../../../api/registry';
import { queryKeys } from '../../../data/keys';

/** État d'une lecture, tel que les écrans l'affichent : squelette, erreur ou données. */
export type QueryStatus = 'loading' | 'error' | 'ready';

function statusOf(query: { readonly isError: boolean; readonly data: unknown }): QueryStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

export interface ReadQuery<T> {
  readonly status: QueryStatus;
  readonly data: T | null;
  /** Erreur brute de la requête, traduite par l'écran (`messageFor`). */
  readonly error: unknown;
  readonly refetch: () => void;
}

/** Longueur minimale d'une recherche, comme le contrat `search.global` (SPEC-212 EF-1). */
export const SEARCH_MIN_LENGTH = 2;

/**
 * Lacunes ouvertes d'une formation (`GET /formations/:fid/gaps`, SPEC-615). La nature filtrée fait
 * partie de la clé : changer de filtre relit les compteurs du serveur, qui restent indépendants du
 * filtre appliqué (ET-3). Les compteurs et la rangée de filtres restent affichés pendant la
 * relecture (`keepPreviousData`) : la rangée ne disparaît pas sous le doigt.
 */
export function useLacunes(
  formationId: string | null,
  nature: GapNature | null,
): ReadQuery<GapListDto> {
  const query = useQuery({
    queryKey: [...queryKeys.gaps(formationId ?? 'none'), nature ?? 'all'],
    queryFn: () =>
      requireApiClient().api.gapsList({
        params: { fid: formationId ?? '' },
        query: nature === null ? {} : { nature },
      }),
    enabled: formationId !== null,
    placeholderData: keepPreviousData,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}

/** Graphe des notions d'une formation (`GET /formations/:fid/notion-graph`, SPEC-616). */
export function useNotionGraph(formationId: string | null): ReadQuery<NotionGraphDto> {
  const query = useQuery({
    queryKey: [...queryKeys.formation(formationId ?? 'none'), 'notion-graph'],
    queryFn: () => requireApiClient().api.notionGraph({ params: { fid: formationId ?? '' } }),
    enabled: formationId !== null,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}

/**
 * Recherche globale (`GET /search`, SPEC-212) : les notions, chapitres et formations du lecteur,
 * groupés par le serveur, avec leurs extraits. Rien n'est lancé sous deux caractères (EF-1).
 */
export function useGlobalSearch(text: string): ReadQuery<SearchResponse> {
  const eligible = Array.from(text).length >= SEARCH_MIN_LENGTH;
  const query = useQuery({
    queryKey: ['search', text],
    queryFn: () => requireApiClient().api.searchGlobal({ query: { q: text } }),
    enabled: eligible,
    retry: 0,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}