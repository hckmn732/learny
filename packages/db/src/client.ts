// Drizzle clients of Learny (SPEC-101 ET-5, ADR-0110).
//
// `serviceDb()` uses the `postgres` connection role, owner of the public tables: it is not subject
// to Row Level Security and is reserved to jobs, webhooks, the AI journal, the seed and tests.
// `userDb(ctx).run(fn)` opens a transaction, publishes the user identity in the Supabase JWT
// settings and switches to the `authenticated` role, so `auth.uid()` and every RLS policy apply.
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';

import { parseServerEnv } from '@learny/config/server';
import { AppError } from '@learny/core';
import { createLogger } from '@learny/core/server';

import * as schema from './schema/index';

/** Local Supabase database (SPEC-008), used when DATABASE_URL is not exported. */
export const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Message appended to every connection failure, so a stalled local stack is actionable (CL-5). */
export const DATABASE_HINT = 'Base locale injoignable : lancer pnpm dev:up';

export interface UserContext {
  userId: string;
  email?: string;
}

export type Db = PostgresJsDatabase<typeof schema>;
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

const UUID = z.uuid();

const queryLogger = createLogger({ level: 'debug' });
const drizzleLogger = {
  // Parameters are deliberately not logged: they may contain personal data (ET-9).
  logQuery(query: string): void {
    queryLogger.debug(query, { component: 'db' });
  },
};

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  '57P03',
  '08000',
  '08001',
  '08006',
]);

function isConnectionFailure(error: Error & { code?: unknown }): boolean {
  if (typeof error.code === 'string' && CONNECTION_CODES.has(error.code)) return true;
  return /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|Connection refused|connection timeout/i.test(
    error.message,
  );
}

/** Adds the actionable hint to a connection failure, leaving business and SQL errors untouched. */
export function annotateConnectionError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  if (error.message.includes(DATABASE_HINT)) return error;
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined) {
    const annotatedCause = annotateConnectionError(cause);
    if (annotatedCause instanceof Error && annotatedCause.message.includes(DATABASE_HINT)) {
      const wrapped = new Error(`${DATABASE_HINT} (${error.message})`, { cause: annotatedCause });
      wrapped.name = error.name;
      return wrapped;
    }
  }
  if (!isConnectionFailure(error)) return error;
  const wrapped = new Error(`${DATABASE_HINT} (${error.message})`, { cause: error });
  wrapped.name = error.name;
  return wrapped;
}

type Thenable = { then?: unknown };

/**
 * Wraps a Drizzle query promise or builder so every awaited result translates connection failures.
 * Drizzle returns lazy builders: the error only appears when the builder is awaited, hence the
 * thenable proxy.
 */
function hinted<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Promise) {
    return value.catch((error: unknown) => {
      throw annotateConnectionError(error);
    }) as T;
  }
  const thenable = value as Thenable;
  if (typeof thenable.then !== 'function') return value;
  return new Proxy(value, {
    get(target, property, receiver) {
      if (property === 'then') {
        const then = thenable.then as (
          this: object,
          onFulfilled?: (result: unknown) => unknown,
          onRejected?: (error: unknown) => unknown,
        ) => unknown;
        return (
          onFulfilled?: (result: unknown) => unknown,
          onRejected?: (error: unknown) => unknown,
        ) =>
          then.call(target, onFulfilled, (error: unknown) => {
            const annotated = annotateConnectionError(error);
            if (onRejected !== undefined) return onRejected(annotated);
            return Promise.reject(
              annotated instanceof Error ? annotated : new Error(String(annotated)),
            );
          });
      }
      const inner: unknown = Reflect.get(target, property, receiver);
      if (typeof inner === 'function') {
        const callable = inner as (...args: unknown[]) => unknown;
        return (...args: unknown[]) => hinted(callable.apply(target, args));
      }
      return inner;
    },
  });
}

/** Guards every top-level Drizzle method (`execute`, `select`, `transaction`, …). */
function guardedDatabase(db: Db): Db {
  return new Proxy(db, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value === 'function') {
        const callable = value as (...args: unknown[]) => unknown;
        return (...args: unknown[]) => hinted(callable.apply(target, args));
      }
      return value;
    },
  });
}

export interface DatabaseOptions {
  url: string;
  max?: number;
  logQueries?: boolean;
}

export interface DatabaseHandle {
  db: Db;
  close: () => Promise<void>;
}

/** Creates an independent pool, used by the singleton and by the connection-failure test (CL-5). */
export function createPostgresDatabase(options: DatabaseOptions): DatabaseHandle {
  const client = postgres(options.url, {
    max: options.max ?? 10,
    // Required by the Supabase transaction pooler; harmless locally.
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const db = drizzle(client, {
    schema,
    casing: 'snake_case',
    ...(options.logQueries === true ? { logger: drizzleLogger } : {}),
  });
  return {
    db: guardedDatabase(db),
    close: () => client.end({ timeout: 5 }),
  };
}

let service: DatabaseHandle | undefined;

function serviceHandle(): DatabaseHandle {
  if (service !== undefined) return service;
  const env = parseServerEnv(process.env);
  const logQueries = env.DB_LOG_QUERIES && env.NODE_ENV !== 'production';
  service = createPostgresDatabase({
    url: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    logQueries,
  });
  return service;
}

/** `serviceDb()`: owner-role client, RLS bypassed, reserved to explicitly listed service usages. */
export function serviceDb(): Db {
  return serviceHandle().db;
}

/** Closes the shared pool (integration tests, worker shutdown). Idempotent. */
export async function closeDb(): Promise<void> {
  const current = service;
  service = undefined;
  if (current !== undefined) await current.close();
}

/** Serialises the Supabase JWT claims of a request; exported for the client unit test. */
export function buildUserClaims(context: UserContext): string {
  return JSON.stringify({
    sub: context.userId,
    role: 'authenticated',
    aud: 'authenticated',
    email: context.email,
  });
}

function assertUser(userId: string): void {
  if (!UUID.safeParse(userId).success) {
    throw new AppError('FORBIDDEN', 'Identifiant utilisateur invalide.');
  }
}

export interface UserDatabase {
  run<T>(fn: (tx: DbTx) => Promise<T>): Promise<T>;
}

/**
 * `userDb(ctx).run(fn)` runs the callback in a transaction under `authenticated` with the user
 * claims set locally: they expire with the transaction and never leak to the next request (CL-2).
 */
export function userDb(context: UserContext): UserDatabase {
  // Rejected before any connection is acquired (CL-1).
  assertUser(context.userId);
  const claims = buildUserClaims(context);
  return {
    async run<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
      assertUser(context.userId);
      return serviceDb().transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('request.jwt.claims', ${claims}, true), set_config('request.jwt.claim.sub', ${context.userId}, true)`,
        );
        await tx.execute(sql.raw('set local role authenticated'));
        return fn(tx);
      });
    },
  };
}
