// Données et mutations du mode simple (SPEC-4003 EF-1 à EF-8 ; canevas § 4).
//
// One read per screen, one mutation per intent, every idempotent write keyed by its intent. The
// server decides the state; these hooks only transport it, poll the analysis while it runs and
// keep the deposit queue in the encrypted store so that a killed application resumes it.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ProgrammeProposalStateDto,
  QuizResultDto,
  SimpleCreateInput,
  SimpleState,
} from '@learny/contracts';
import { fr } from '@learny/i18n';

import { idempotencyRegistry } from '../api/idempotency';
import { requireApiClient } from '../api/registry';
import { uuidV4 } from '../api/uuid';
import { secureSessionStorage } from '../auth/secure-backend';
import { queryKeys } from '../data/keys';

import {
  parseQueue,
  queueKey,
  serializeQueue,
  UploadRunner,
  type UploadTask,
} from './upload-queue';
import { simpleUploadTransport } from './upload-transport';

const t = fr.mobile.simple;

export type SimpleStatus = 'loading' | 'error' | 'ready';

/** Une lecture du mode simple, avec interrogation optionnelle (2 s) pendant l'analyse. */
export function useSimpleState(
  formationId: string | null,
  options: { readonly poll?: boolean } = {},
): {
  readonly status: SimpleStatus;
  readonly data: SimpleState | null;
  readonly refetch: () => Promise<void>;
} {
  const query: UseQueryResult<SimpleState> = useQuery({
    queryKey: queryKeys.simple(formationId ?? 'none'),
    queryFn: () => requireApiClient().api.simpleGet({ params: { fid: formationId ?? '' } }),
    enabled: formationId !== null,
    retry: 1,
    refetchInterval: (context) => {
      if (options.poll !== true) return false;
      const status = context.state.data?.status;
      return status === 'collecting' || status === 'analysing' ? 2000 : false;
    },
  });
  return {
    status:
      formationId === null
        ? 'error'
        : query.isError
          ? 'error'
          : query.data === undefined
            ? 'loading'
            : 'ready',
    data: query.data ?? null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/** Création d'une formation simple (EF-2). */
export function useCreateSimpleFormation(): {
  readonly create: (input: SimpleCreateInput) => Promise<SimpleState>;
  readonly pending: boolean;
} {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: SimpleCreateInput) => {
      const intent = `simple-create:${uuidV4()}`;
      return requireApiClient()
        .api.simpleCreate({ body: input }, { idempotencyKey: idempotencyRegistry.keyFor(intent) })
        .then((state) => {
          idempotencyRegistry.resolve(intent);
          return state;
        });
    },
    onSuccess: (state) => {
      client.setQueryData(queryKeys.simple(state.formationId), state);
      void client.invalidateQueries({ queryKey: queryKeys.home() });
    },
  });
  return { create: mutation.mutateAsync, pending: mutation.isPending };
}

/** Lancement de l'analyse (EF-4) ; `AI_NOT_CONFIGURED` est laissé à l'écran (EF-3). */
export function useLaunchAnalysis(formationId: string | null): {
  readonly launch: () => Promise<SimpleState>;
  readonly pending: boolean;
} {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      if (formationId === null) throw new Error('Formation inconnue.');
      const intent = `simple-analysis:${formationId}`;
      return requireApiClient()
        .api.simpleAnalysis(
          { params: { fid: formationId } },
          { idempotencyKey: idempotencyRegistry.keyFor(intent) },
        )
        .then((state) => {
          idempotencyRegistry.resolve(intent);
          return state;
        });
    },
    onSuccess: (state) => {
      client.setQueryData(queryKeys.simple(state.formationId), state);
      void client.invalidateQueries({ queryKey: queryKeys.home() });
    },
  });
  return { launch: mutation.mutateAsync, pending: mutation.isPending };
}

/** Rôle d'un document (EF-2) : refusé par le serveur après le début de l'analyse. */
export function useSetRole(formationId: string | null): {
  readonly setRole: (resourceId: string, role: UploadTask['role']) => Promise<void>;
  readonly pending: boolean;
} {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (variables: { resourceId: string; role: UploadTask['role'] }) =>
      requireApiClient().api.resourceRole({
        params: { rid: variables.resourceId },
        body: { role: variables.role },
      }),
    onSuccess: () => {
      if (formationId !== null)
        void client.invalidateQueries({ queryKey: queryKeys.simple(formationId) });
    },
  });
  return {
    setRole: async (resourceId, role) => {
      await mutation.mutateAsync({ resourceId, role });
    },
    pending: mutation.isPending,
  };
}

/** Suppression d'un document encore en dépôt. */
export function useRemoveSource(formationId: string | null): {
  readonly remove: (resourceId: string) => Promise<void>;
  readonly pending: boolean;
} {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (resourceId: string) =>
      requireApiClient().api.resourcesDelete({ params: { rid: resourceId } }),
    onSuccess: () => {
      if (formationId !== null)
        void client.invalidateQueries({ queryKey: queryKeys.simple(formationId) });
    },
  });
  return {
    remove: async (resourceId) => {
      await mutation.mutateAsync(resourceId);
    },
    pending: mutation.isPending,
  };
}

/** Validation du programme (EF-6) : renvoie l'état actif prêt pour le diagnostic. */
export function useValidateProgramme(formationId: string | null): {
  readonly validate: (expectedVersion: number) => Promise<ProgrammeProposalStateDto>;
  readonly pending: boolean;
} {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (expectedVersion: number) => {
      if (formationId === null) throw new Error('Formation inconnue.');
      const intent = `simple-validate:${formationId}:${String(expectedVersion)}`;
      return requireApiClient()
        .api.programmeValidate(
          { params: { fid: formationId }, body: { expectedVersion } },
          { idempotencyKey: idempotencyRegistry.keyFor(intent) },
        )
        .then((state) => {
          idempotencyRegistry.resolve(intent);
          return state;
        });
    },
    onSuccess: () => {
      if (formationId !== null) {
        void client.invalidateQueries({ queryKey: queryKeys.simple(formationId) });
        void client.invalidateQueries({ queryKey: queryKeys.programme(formationId) });
        void client.invalidateQueries({ queryKey: queryKeys.home() });
      }
    },
  });
  return { validate: mutation.mutateAsync, pending: mutation.isPending };
}

/** Échéance de la formation (EF-6) ; `null` revient au rythme du profil. */
export function useDeadline(formationId: string | null): {
  readonly save: (endDate: string | null) => Promise<void>;
  readonly pending: boolean;
  readonly error: unknown;
} {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (endDate: string | null) => {
      if (formationId === null) throw new Error('Formation inconnue.');
      await requireApiClient().api.formationUpdate({
        params: { fid: formationId },
        body: { endDate },
      });
    },
    onSuccess: () => {
      if (formationId !== null) {
        void client.invalidateQueries({ queryKey: queryKeys.programme(formationId) });
        void client.invalidateQueries({ queryKey: queryKeys.simple(formationId) });
      }
    },
  });
  return { save: mutation.mutateAsync, pending: mutation.isPending, error: mutation.error };
}

/** Création du diagnostic global (EF-7) ; renvoie la tentative à jouer. */
export function useCreateDiagnostic(formationId: string | null): {
  readonly create: () => Promise<string>;
  readonly pending: boolean;
} {
  const mutation = useMutation({
    mutationFn: () => {
      if (formationId === null) throw new Error('Formation inconnue.');
      const intent = `simple-diagnostic:${formationId}`;
      return requireApiClient()
        .api.diagnosticCreate(
          { params: { fid: formationId } },
          { idempotencyKey: idempotencyRegistry.keyFor(intent) },
        )
        .then((created) => {
          idempotencyRegistry.resolve(intent);
          return created.attemptId;
        });
    },
  });
  return { create: mutation.mutateAsync, pending: mutation.isPending };
}

/** Passe le diagnostic (EF-7) : la tentative est abandonnée et rien n'est validé. */
export function useSkipDiagnostic(formationId: string | null): {
  readonly skip: () => Promise<void>;
  readonly pending: boolean;
} {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      if (formationId === null) throw new Error('Formation inconnue.');
      return requireApiClient().api.diagnosticSkip({ params: { fid: formationId } });
    },
    onSuccess: () => {
      if (formationId !== null)
        void client.invalidateQueries({ queryKey: queryKeys.simple(formationId) });
    },
  });
  return { skip: mutation.mutateAsync, pending: mutation.isPending };
}

/** Soumet la tentative du diagnostic (EF-7) et renvoie son résultat complet. */
export function useSubmitDiagnostic(formationId: string | null): {
  readonly submit: (attemptId: string) => Promise<QuizResultDto>;
  readonly pending: boolean;
} {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (attemptId: string) => {
      await requireApiClient().api.submitQuizAttempt({ params: { aid: attemptId } });
      return requireApiClient().api.getQuizResult({ params: { aid: attemptId } });
    },
    onSuccess: (result) => {
      client.setQueryData(queryKeys.simpleAttempt(result.attemptId), result);
      if (formationId !== null) {
        void client.invalidateQueries({ queryKey: queryKeys.simple(formationId) });
        void client.invalidateQueries({ queryKey: queryKeys.programme(formationId) });
        void client.invalidateQueries({ queryKey: queryKeys.home() });
      }
    },
  });
  return { submit: mutation.mutateAsync, pending: mutation.isPending };
}

export interface SimpleQueue {
  readonly items: readonly UploadTask[];
  readonly loaded: boolean;
  readonly busy: boolean;
  readonly start: () => Promise<void>;
  readonly retry: (id?: string) => void;
  readonly add: (tasks: readonly UploadTask[]) => void;
  readonly remove: (id: string) => void;
}

/**
 * File persistée d'une formation. Au montage, les tâches stockées sont relues et les envois
 * interrompus repassent en attente ; `start` lance au plus deux envois et `onDone` prévient l'écran.
 */
export function useSimpleQueue(
  formationId: string | null,
  options: { readonly onDone?: () => void } = {},
): SimpleQueue {
  const [items, setItems] = useState<readonly UploadTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const runner = useRef<UploadRunner | null>(null);
  const done = useRef(options.onDone);
  useEffect(() => {
    done.current = options.onDone;
  }, [options.onDone]);

  useEffect(() => {
    let cancelled = false;
    if (formationId === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- aucune formation : file vide.
      setItems([]);

      setLoaded(true);
      return undefined;
    }
    void Promise.resolve(secureSessionStorage.getItem(queueKey(formationId)))
      .then((raw) => {
        if (cancelled) return;
        const restored = parseQueue(raw);
        setItems(restored);
        setLoaded(true);
        runner.current = new UploadRunner(restored, {
          transport: simpleUploadTransport(formationId),
          onChange: (next) => {
            setItems(next);
            void secureSessionStorage.setItem(queueKey(formationId), serializeQueue(next));
          },
          onDone: () => {
            done.current?.();
          },
        });
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [formationId]);

  const start = useCallback(async () => {
    if (runner.current === null) return;
    setBusy(true);
    try {
      await runner.current.start();
    } finally {
      setBusy(false);
    }
  }, []);

  const retry = useCallback((id?: string) => {
    runner.current?.retry(id);
  }, []);

  const add = useCallback((tasks: readonly UploadTask[]) => {
    if (runner.current === null) return;
    runner.current.add(tasks);
  }, []);

  const remove = useCallback(
    (id: string) => {
      if (formationId === null || runner.current === null) return;
      const next = runner.current.snapshot().filter((task) => task.id !== id);
      runner.current = new UploadRunner(next, {
        transport: simpleUploadTransport(formationId),
        onChange: (itemsNext) => {
          setItems(itemsNext);
          void secureSessionStorage.setItem(queueKey(formationId), serializeQueue(itemsNext));
        },
        onDone: () => {
          done.current?.();
        },
      });
      setItems(next);
      void secureSessionStorage.setItem(queueKey(formationId), serializeQueue(next));
    },
    [formationId],
  );

  return { items, loaded, busy, start, retry, add, remove };
}

/** Écrit une file initiale pour une formation qui vient d'être créée. */
export async function saveQueue(formationId: string, tasks: readonly UploadTask[]): Promise<void> {
  await secureSessionStorage.setItem(queueKey(formationId), serializeQueue(tasks));
}

/** Construit une tâche de fichier depuis le sélecteur. */
export function fileTask(input: {
  readonly uri: string;
  readonly name: string;
  readonly mime: string;
  readonly sizeBytes: number;
  readonly role?: UploadTask['role'];
}): UploadTask {
  return {
    id: uuidV4(),
    kind: 'file',
    name: input.name,
    mime: input.mime,
    sizeBytes: Math.max(1, input.sizeBytes),
    uri: input.uri,
    role: input.role ?? 'course',
    status: 'pending',
    sentBytes: 0,
  };
}

/** Construit une tâche de lien. */
export function linkTask(input: {
  readonly url: string;
  readonly role?: UploadTask['role'];
}): UploadTask {
  const title = new URL(input.url).hostname;
  return {
    id: uuidV4(),
    kind: 'link',
    name: title,
    mime: 'text/uri-list',
    sizeBytes: 1,
    url: input.url,
    role: input.role ?? 'other',
    status: 'pending',
    sentBytes: 0,
  };
}

/** Message d'erreur d'un envoi, ou le générique de l'application. */
export function uploadErrorMessage(error: unknown): string {
  return error instanceof Error && error.message !== ''
    ? t.deposit.uploadFailed
    : t.deposit.uploadFailed;
}
