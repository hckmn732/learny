// Résultat commun des écritures de la zone Création : un booléen et le code d'erreur de l'API.
import { isAppError } from '@learny/core';

export interface CreationOutcome {
  readonly ok: boolean;
  /** Code d'erreur de `problem+json`, `INTERNAL_ERROR` pour tout le reste. */
  readonly code: string | null;
}

export const OK: CreationOutcome = { ok: true, code: null };

/** Traduit une exception d'écriture en résultat affichable. */
export function outcomeOf(error: unknown): CreationOutcome {
  return { ok: false, code: isAppError(error) ? error.code : 'INTERNAL_ERROR' };
}