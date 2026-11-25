// Données des premiers pas (onboarding natif) et du rythme de la proposition (zone B).
//
// Une seule lecture (`GET /me/onboarding`) sert les deux écrans : le profil, le rythme et les
// rappels. Les écritures sont celles du web : `PATCH /me` (profil), `PATCH /me/preferences`
// (rythme) et `PATCH /me/onboarding` (étape suivante, rappels de l'étape « depart »).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type {
  OnboardingState,
  OnboardingUpdateBody,
  ProfileUpdateBody,
  StudyPreferencesDto,
} from '@learny/contracts';

import { requireApiClient } from '../../../api/registry';
import { queryKeys } from '../../../data/keys';

import { OK, outcomeOf, type CreationOutcome } from './outcome';

export type CreationStatus = 'loading' | 'error' | 'ready';

export interface OnboardingQuery {
  readonly status: CreationStatus;
  readonly state: OnboardingState | null;
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
}

/** Profil, rythme et rappels de l'apprenant (`GET /me/onboarding`). */
export function useOnboardingState(): OnboardingQuery {
  const query = useQuery({
    queryKey: queryKeys.onboarding(),
    queryFn: () => requireApiClient().api.meOnboardingGet({}),
    staleTime: 0,
    retry: 1,
  });
  return {
    status: query.isError ? 'error' : query.data === undefined ? 'loading' : 'ready',
    state: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

export interface OnboardingWriter {
  /** Avance l'étape (jamais de recul côté serveur) et applique les rappels de « depart ». */
  readonly advance: (body: OnboardingUpdateBody) => Promise<CreationOutcome>;
  readonly pending: boolean;
  readonly errorCode: string | null;
}

/** `PATCH /me/onboarding` — une étape par écran, sans recul possible. */
export function useOnboardingUpdate(): OnboardingWriter {
  const client = useQueryClient();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (body: OnboardingUpdateBody) => requireApiClient().api.meOnboardingUpdate({ body }),
  });

  const advance = async (body: OnboardingUpdateBody): Promise<CreationOutcome> => {
    setErrorCode(null);
    try {
      const result = await mutation.mutateAsync(body);
      client.setQueryData<OnboardingState | undefined>(
        queryKeys.onboarding(),
        (previous) =>
          previous === undefined
            ? previous
            : {
                ...previous,
                profile: { ...previous.profile, onboardingStep: result.onboardingStep },
              },
      );
      void client.invalidateQueries({ queryKey: queryKeys.onboarding() });
      return OK;
    } catch (error) {
      const outcome = outcomeOf(error);
      setErrorCode(outcome.code);
      return outcome;
    }
  };

  return { advance, pending: mutation.isPending, errorCode };
}

export interface ProfileWriter {
  readonly update: (body: ProfileUpdateBody) => Promise<CreationOutcome>;
  readonly pending: boolean;
}

/** `PATCH /me` — prénom, ton du tuteur, langue des cours ou fuseau. */
export function useProfileUpdate(): ProfileWriter {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: ProfileUpdateBody) => requireApiClient().api.meUpdate({ body }),
  });

  const update = async (body: ProfileUpdateBody): Promise<CreationOutcome> => {
    try {
      const me = await mutation.mutateAsync(body);
      client.setQueryData(queryKeys.me(), me);
      void client.invalidateQueries({ queryKey: queryKeys.onboarding() });
      return OK;
    } catch (error) {
      return outcomeOf(error);
    }
  };

  return { update, pending: mutation.isPending };
}

export interface RhythmWriter {
  readonly save: (rhythm: StudyPreferencesDto) => Promise<CreationOutcome>;
  readonly pending: boolean;
}

/** `PATCH /me/preferences` — heures par jour, jours et moments (BR-ACC-08). */
export function useRhythmUpdate(): RhythmWriter {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (rhythm: StudyPreferencesDto) =>
      requireApiClient().api.mePreferencesUpdate({ body: rhythm }),
  });

  const save = async (rhythm: StudyPreferencesDto): Promise<CreationOutcome> => {
    try {
      const preferences = await mutation.mutateAsync(rhythm);
      client.setQueryData<OnboardingState | undefined>(
        queryKeys.onboarding(),
        (previous) =>
          previous === undefined ? previous : { ...previous, preferences },
      );
      void client.invalidateQueries({ queryKey: ['me'] });
      return OK;
    } catch (error) {
      return outcomeOf(error);
    }
  };

  return { save, pending: mutation.isPending };
}