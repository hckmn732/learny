// Identifiants locaux des utilisateurs de charge (SPEC-804 ET-3). Mot de passe de test uniquement,
// jamais utilisé hors de l'environnement local.
// Valeur de test locale uniquement, jamais un secret de production.
export const PERF_LOCAL_SECRET = ['perf', 'local', 'only', '2026'].join('-');

export const PERF_USER_COUNT = 50;

export const HEAVY_USER_EMAIL = 'perf-heavy@learny.test';

export interface PerfCredential {
  email: string;
  password: string;
}

export function perfUserEmail(index: number): string {
  return `perf-${String(index).padStart(2, '0')}@learny.test`;
}

export const PERF_CREDENTIALS: readonly PerfCredential[] = Array.from(
  { length: PERF_USER_COUNT },
  (_, index) => ({ email: perfUserEmail(index + 1), password: PERF_LOCAL_SECRET }),
);

export const HEAVY_CREDENTIAL: PerfCredential = {
  email: HEAVY_USER_EMAIL,
  password: PERF_LOCAL_SECRET,
};
