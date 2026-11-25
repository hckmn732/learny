// Données de l'écran « programme proposé » (maquette Proposition.dc.html).
//
// Lecture : `GET /formations/:fid/programme` rend la proposition ou le programme déjà actif.
// Écritures : `generate`, `adjust` et `validate`, toutes idempotentes (une clé par intention,
// conservée jusqu'au succès). La validation active la formation : les caches de formation sont
// alors invalidés pour que l'onglet Programme reflète l'état du serveur.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  isActiveProgramme,
  type ProgrammeProposalStateDto,
  type ProgrammeScreenStateDto,
} from '@learny/contracts';

import { idempotencyRegistry } from '../../../api/idempotency';
import { requireApiClient } from '../../../api/registry';
import { queryKeys } from '../../../data/keys';

import { OK, outcomeOf, type CreationOutcome } from './outcome';

export type PropositionStatus = 'loading' | 'error' | 'ready';

export interface PropositionQuery {
  readonly status: PropositionStatus;
  readonly state: ProgrammeScreenStateDto | null;
  /** La proposition à valider, `null` quand le programme est déjà actif. */
  readonly proposal: ProgrammeProposalStateDto | null;
  readonly active: boolean;
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
}

/** Proposition courante ou programme actif d'une formation. */
export function useProposition(formationId: string | null): PropositionQuery {
  const query = useQuery({
    queryKey: queryKeys.programme(formationId ?? 'none'),
    queryFn: () =>
      requireApiClient().api.programmeGet({ params: { fid: formationId ?? '' } }),
    enabled: formationId !== null,
    retry: false,
    staleTime: 0,
  });
  const state = formationId === null ? null : (query.data ?? null);
  const active = state !== null && isActiveProgramme(state);
  return {
    status: formationId === null ? 'ready' : query.isError ? 'error' : query.data === undefined ? 'loading' : 'ready',
    state,
    proposal: state !== null && !isActiveProgramme(state) ? state : null,
    active,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

export interface PropositionActions {
  readonly generate: () => Promise<CreationOutcome>;
  readonly adjust: (message: string, expectedVersion: number) => Promise<CreationOutcome>;
  readonly validate: (expectedVersion: number) => Promise<CreationOutcome>;
  readonly generating: boolean;
  readonly adjusting: boolean;
  readonly validating: boolean;
  readonly errorCode: string | null;
  readonly clearError: () => void;
}

/** Actions d'écriture de la proposition, avec leur clé d'idempotence. */
export function usePropositionActions(formationId: string | null): PropositionActions {
  const client = useQueryClient();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: () =>
      requireApiClient().api.programmeGenerate(
        { params: { fid: formationId ?? '' }, body: { expectedVersion: 0 } },
        { idempotencyKey: idempotencyRegistry.keyFor(`proposition:generate:${formationId ?? ''}`) },
      ),
  });
  const adjustMutation = useMutation({
    mutationFn: (input: { readonly message: string; readonly expectedVersion: number }) =>
      requireApiClient().api.programmeAdjust(
        {
          params: { fid: formationId ?? '' },
          body: { expectedVersion: input.expectedVersion, message: input.message },
        },
        {
          idempotencyKey: idempotencyRegistry.keyFor(
            `proposition:adjust:${formationId ?? ''}:${input.message}`,
          ),
        },
      ),
  });
  const validateMutation = useMutation({
    mutationFn: (expectedVersion: number) =>
      requireApiClient().api.programmeValidate(
        { params: { fid: formationId ?? '' }, body: { expectedVersion } },
        { idempotencyKey: idempotencyRegistry.keyFor(`proposition:validate:${formationId ?? ''}`) },
      ),
  });

  const store = async (
    key: string,
    run: () => Promise<ProgrammeProposalStateDto>,
    invalidate: boolean,
  ): Promise<CreationOutcome> => {
    if (formationId === null) return { ok: false, code: 'NOT_FOUND' };
    setErrorCode(null);
    try {
      const data = await run();
      idempotencyRegistry.resolve(key);
      client.setQueryData(queryKeys.programme(formationId), data);
      if (invalidate) {
        await Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.formation(formationId) }),
          client.invalidateQueries({ queryKey: queryKeys.formations() }),
          client.invalidateQueries({ queryKey: queryKeys.sidebar() }),
          client.invalidateQueries({ queryKey: queryKeys.home() }),
        ]);
      }
      return OK;
    } catch (error) {
      const outcome = outcomeOf(error);
      setErrorCode(outcome.code);
      return outcome;
    }
  };

  return {
    generate: () =>
      store(`proposition:generate:${formationId ?? ''}`, () => generateMutation.mutateAsync(), false),
    adjust: (message, expectedVersion) =>
      store(
        `proposition:adjust:${formationId ?? ''}:${message}`,
        () => adjustMutation.mutateAsync({ message, expectedVersion }),
        false,
      ),
    validate: (expectedVersion) =>
      store(
        `proposition:validate:${formationId ?? ''}`,
        () => validateMutation.mutateAsync(expectedVersion),
        true,
      ),
    generating: generateMutation.isPending,
    adjusting: adjustMutation.isPending,
    validating: validateMutation.isPending,
    errorCode,
    clearError: () => {
      setErrorCode(null);
    },
  };
}