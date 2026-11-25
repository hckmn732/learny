// Contexte d'une activité ouverte par identifiant seul (zone C).
//
// Les routes `exercice/[brickId]` et `examen-blanc/[activityId]` ne reçoivent qu'un identifiant,
// alors que l'API exige la formation (et le module pour un exercice). La source par défaut est le
// créneau du jour de `GET /home`, qui porte `formationId`, `moduleId` et `activityId` ; `fid` et
// `mid` acceptés en query servent d'override au recâblage des points d'entrée (arbitrage du lead,
// 2026-11-25). Un contexte introuvable n'est jamais deviné : l'écran affiche un état dédié.
import type { HomeSlot } from '@learny/contracts';

import { useHome } from '../../../data/home';

export type ContextStatus = 'loading' | 'error' | 'ready' | 'missing';

/** Ce qu'un écran d'évaluation doit savoir pour appeler l'API. */
export interface EvaluationContext {
  readonly status: ContextStatus;
  readonly formationId: string | null;
  readonly moduleId: string | null;
  readonly slot: HomeSlot | null;
  readonly retry: () => void;
}

function findSlot(slots: readonly HomeSlot[], activityId: string | null): HomeSlot | null {
  if (activityId === null) return null;
  return slots.find((slot) => slot.activityId === activityId) ?? null;
}

function statusOf(
  homeStatus: 'loading' | 'error' | 'ready',
  resolved: boolean,
): ContextStatus {
  if (resolved) return 'ready';
  if (homeStatus === 'loading') return 'loading';
  if (homeStatus === 'error') return 'error';
  return 'missing';
}

/** Formation d'une activité (examen blanc : pas de module). */
export function useFormationContext(
  activityId: string | null,
  explicitFormationId: string | null,
): EvaluationContext {
  const home = useHome();
  const slot = findSlot(home.data?.today.slots ?? [], activityId);
  const formationId = explicitFormationId ?? slot?.formationId ?? null;
  return {
    status: statusOf(home.status, formationId !== null),
    formationId,
    moduleId: slot?.moduleId ?? null,
    slot,
    retry: home.refetch,
  };
}

/** Formation et module d'un exercice pratique. */
export function useExerciseContext(
  activityId: string | null,
  explicitFormationId: string | null,
  explicitModuleId: string | null,
): EvaluationContext {
  const home = useHome();
  const slot = findSlot(home.data?.today.slots ?? [], activityId);
  const formationId = explicitFormationId ?? slot?.formationId ?? null;
  const moduleId = explicitModuleId ?? slot?.moduleId ?? null;
  return {
    status: statusOf(home.status, formationId !== null && moduleId !== null),
    formationId,
    moduleId,
    slot,
    retry: home.refetch,
  };
}