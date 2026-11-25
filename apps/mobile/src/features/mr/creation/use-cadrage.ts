// Données de l'écran de cadrage (zone B, maquette Cadrage.dc.html).
//
// La création de la formation passe par `POST /formations` (le serveur renvoie le premier état du
// cadrage) ; la suite de la conversation par `POST /formations/:fid/cadrage/messages`. Un envoi
// garde sa clé d'idempotence pour sa nouvelle tentative (une réponse n'est jamais écrite deux
// fois) ; `retry: true` relance le tour du tuteur sans dupliquer le message de l'apprenant.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import type { CadrageMessageCreateInput, CadrageStateDto } from '@learny/contracts';
import { isAppError } from '@learny/core';

import { idempotencyRegistry } from '../../../api/idempotency';
import { requireApiClient } from '../../../api/registry';
import { uuidV4 } from '../../../api/uuid';
import { queryKeys } from '../../../data/keys';

/** Clé du cadrage d'une formation. TODO(quickfix) : la remonter dans `src/data/keys.ts`. */
function cadrageKey(formationId: string): readonly ['formation', string, 'cadrage'] {
  return ['formation', formationId, 'cadrage'] as const;
}

export type CadrageStatus = 'loading' | 'error' | 'ready';

/** Résultat d'une action : le code d'erreur de l'API, ou rien. */
export interface CreationOutcome {
  readonly ok: boolean;
  readonly code: string | null;
}

const OK: CreationOutcome = { ok: true, code: null };

function outcomeOf(error: unknown): CreationOutcome {
  return { ok: false, code: isAppError(error) ? error.code : 'INTERNAL_ERROR' };
}

interface Attempt {
  readonly input: CadrageMessageCreateInput;
  readonly key: string;
}

export interface CadrageController {
  readonly state: CadrageStateDto | null;
  readonly status: CadrageStatus;
  readonly errorCode: string | null;
  /** Crée la formation puis rend son identifiant ; `null` quand la création a échoué. */
  readonly create: (title: string) => Promise<string | null>;
  readonly creating: boolean;
  /** Envoie une réponse (texte, sélection ou nouvelle tentative du tuteur). */
  readonly send: (input: CadrageMessageCreateInput) => Promise<CreationOutcome>;
  readonly sending: boolean;
  /** Rejoue le dernier envoi avec la même clé d'idempotence (coupure réseau). */
  readonly retryLast: () => Promise<CreationOutcome>;
  /** Rejoue le tour du tuteur sur le dernier message (échec du modèle). */
  readonly retryTutor: () => Promise<CreationOutcome>;
  readonly complete: () => Promise<CreationOutcome>;
  readonly completing: boolean;
  readonly refresh: () => void;
  readonly clearError: () => void;
}

/**
 * État et actions d'un cadrage. `formationId` vaut `null` tant que la formation n'existe pas :
 * l'écran affiche alors le premier champ (le sujet de la formation).
 */
export function useCadrage(formationId: string | null): CadrageController {
  const client = useQueryClient();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<Attempt | null>(null);

  const query = useQuery({
    queryKey: formationId === null ? ['formation', 'none', 'cadrage'] : cadrageKey(formationId),
    queryFn: () =>
      requireApiClient().api.cadrageGet({ params: { fid: formationId ?? '' } }),
    enabled: formationId !== null,
    staleTime: 30_000,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      requireApiClient().api.formationsCreate(
        { body: { title } },
        { idempotencyKey: idempotencyRegistry.keyFor(`cadrage:create:${title}`) },
      ),
  });

  const sendMutation = useMutation({
    mutationFn: (attempt: Attempt) =>
      requireApiClient().api.cadrageMessageCreate(
        { params: { fid: formationId ?? '' }, body: attempt.input },
        { idempotencyKey: attempt.key },
      ),
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      requireApiClient().api.cadrageComplete({ params: { fid: formationId ?? '' } }),
  });

  const run = useCallback(
    async (attempt: Attempt): Promise<CreationOutcome> => {
      if (formationId === null) return { ok: false, code: 'NOT_FOUND' };
      setErrorCode(null);
      setLastAttempt(attempt);
      try {
        const state = await sendMutation.mutateAsync(attempt);
        client.setQueryData(cadrageKey(formationId), state);
        setLastAttempt(null);
        return OK;
      } catch (error) {
        const outcome = outcomeOf(error);
        setErrorCode(outcome.code);
        return outcome;
      }
    },
    [client, formationId, sendMutation],
  );

  const create = useCallback(
    async (title: string): Promise<string | null> => {
      const trimmed = title.trim();
      if (trimmed === '') {
        setErrorCode('SUBJECT_EMPTY');
        return null;
      }
      setErrorCode(null);
      try {
        const result = await createMutation.mutateAsync(trimmed);
        idempotencyRegistry.resolve(`cadrage:create:${trimmed}`);
        client.setQueryData(cadrageKey(result.formation.id), result.cadrage);
        return result.formation.id;
      } catch (error) {
        const outcome = outcomeOf(error);
        setErrorCode(outcome.code);
        return null;
      }
    },
    [client, createMutation],
  );

  const send = useCallback(
    (input: CadrageMessageCreateInput): Promise<CreationOutcome> =>
      run({ input, key: uuidV4() }),
    [run],
  );

  const retryLast = useCallback(
    (): Promise<CreationOutcome> =>
      lastAttempt === null
        ? Promise.resolve({ ok: false, code: 'NETWORK_ERROR' })
        : run(lastAttempt),
    [lastAttempt, run],
  );

  const retryTutor = useCallback((): Promise<CreationOutcome> => {
    const attempt: Attempt = { input: { retry: true }, key: uuidV4() };
    return run(attempt);
  }, [run]);

  const complete = useCallback(async (): Promise<CreationOutcome> => {
    if (formationId === null) return { ok: false, code: 'NOT_FOUND' };
    setErrorCode(null);
    try {
      await completeMutation.mutateAsync();
      await Promise.all([
        client.invalidateQueries({ queryKey: cadrageKey(formationId) }),
        client.invalidateQueries({ queryKey: queryKeys.formation(formationId) }),
        client.invalidateQueries({ queryKey: queryKeys.formations() }),
        client.invalidateQueries({ queryKey: queryKeys.sidebar() }),
      ]);
      return OK;
    } catch (error) {
      const outcome = outcomeOf(error);
      setErrorCode(outcome.code);
      return outcome;
    }
  }, [client, completeMutation, formationId]);

  const refresh = useCallback((): void => {
    void query.refetch();
  }, [query]);

  const state = formationId === null ? null : (query.data ?? null);
  const status: CadrageStatus =
    formationId === null ? 'ready' : query.isError ? 'error' : query.data === undefined ? 'loading' : 'ready';

  return useMemo(
    () => ({
      state,
      status,
      errorCode,
      create,
      creating: createMutation.isPending,
      send,
      sending: sendMutation.isPending,
      retryLast,
      retryTutor,
      complete,
      completing: completeMutation.isPending,
      refresh,
      clearError: () => {
        setErrorCode(null);
      },
    }),
    [
      state,
      status,
      errorCode,
      create,
      createMutation.isPending,
      send,
      sendMutation.isPending,
      retryLast,
      retryTutor,
      complete,
      completeMutation.isPending,
      refresh,
    ],
  );
}