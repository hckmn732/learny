// Garde d'environnement et horloge de la seed de démonstration (SPEC-115 EF-5, ET-3, CL-2, CL-3).
//
// La garde est pure et testable sans base : elle est exécutée avant toute connexion en écriture.
// L'horloge est toujours figée (valeur ADR-0047 par défaut) ; la seed ne lit jamais l'heure réelle.
import { createClockFromEnv } from '@learny/core';

import { DEMO_NOW_ISO } from './demo-fixtures';

export const DEFAULT_DEMO_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Hôtes explicitement locaux ou de test (EF-5, CL-3). */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'host.docker.internal',
  'supabase_db_learny',
]);

export interface DemoEnvironment {
  databaseUrl: string;
  fixedAt: string;
}

export interface DemoEnvironmentInput {
  APP_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
  CLOCK_FIXED_AT?: string | undefined;
}

/**
 * Refuse la production, le preview et tout hôte non local/test avant la moindre connexion.
 * Le message ne reprend jamais le contenu de l'URL (mot de passe éventuel).
 */
export function assertDemoEnvironment(env: DemoEnvironmentInput = process.env): DemoEnvironment {
  const appEnv = (env.APP_ENV ?? 'local').toLowerCase();
  if (appEnv === 'production' || appEnv === 'preview') {
    throw new Error(
      `Seed de démonstration refusée : APP_ENV=${appEnv} n’est pas un environnement local/test.`,
    );
  }
  if (appEnv !== 'local' && appEnv !== 'test' && appEnv !== 'development') {
    throw new Error(
      `Seed de démonstration refusée : APP_ENV=${appEnv} n’est pas un environnement local/test.`,
    );
  }

  const rawUrl = env.DATABASE_URL ?? DEFAULT_DEMO_DATABASE_URL;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Seed de démonstration refusée : DATABASE_URL est invalide.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Seed de démonstration refusée : DATABASE_URL n’est pas une URL PostgreSQL.');
  }
  const host = url.hostname.toLowerCase();
  const local =
    LOCAL_HOSTS.has(host) ||
    host.endsWith('.test') ||
    host.endsWith('.localhost') ||
    host.endsWith('.local');
  if (!local) {
    throw new Error(
      `Seed de démonstration refusée : l’hôte ${host} n’est ni local ni de test (aucune connexion ouverte).`,
    );
  }

  const fixedAt = env.CLOCK_FIXED_AT ?? DEMO_NOW_ISO;
  const clock = createClockFromEnv({ CLOCK_FIXED_AT: fixedAt });
  const now = clock.now();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`Seed de démonstration refusée : CLOCK_FIXED_AT invalide (${fixedAt}).`);
  }

  return { databaseUrl: rawUrl, fixedAt };
}

/** Instant de référence figé : ADR-0047 sauf CLOCK_FIXED_AT explicite. */
export function demoNow(env: DemoEnvironmentInput = process.env): Date {
  return createClockFromEnv({ CLOCK_FIXED_AT: env.CLOCK_FIXED_AT ?? DEMO_NOW_ISO }).now();
}

/**
 * Traduit une erreur SQL en message actionnable. Une dépendance absente (migration non appliquée)
 * nomme la table et rappelle qu'aucune écriture n'est conservée (CL-2).
 */
export function describeSeedFailure(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error);
  if (code === '42P01' || /relation .* does not exist/i.test(message)) {
    const relation = /relation "([^"]+)"/i.exec(message)?.[1] ?? 'table inconnue';
    return `Seed de démonstration impossible : dépendance manquante (${relation}). La transaction est annulée, aucune écriture n’est conservée.`;
  }
  if (code === '23503') {
    return `Seed de démonstration impossible : clé étrangère incohérente. La transaction est annulée (${message}).`;
  }
  if (code === '23514') {
    return `Seed de démonstration impossible : une contrainte de cohérence a échoué (${message}). La transaction est annulée.`;
  }
  return `Seed de démonstration impossible : ${message}`;
}
