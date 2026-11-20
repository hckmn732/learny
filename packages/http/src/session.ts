import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { JWTPayload } from 'jose';

import { parsePublicEnv } from '@learny/config/server';
import { AppError, clock } from '@learny/core';

import {
  verifyAccessToken,
  warnJwtVerificationUnavailable,
  type JwtVerificationOptions,
} from './jwt';

export interface SessionUser {
  userId: string;
  email: string | null;
  emailConfirmed: boolean;
}

export interface Identity extends SessionUser {
  claims: JWTPayload;
  transport: 'bearer' | 'cookie';
}

export interface IdentityDependencies {
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  fetcher?: typeof fetch;
  verifyToken?: (
    token: string,
    options: JwtVerificationOptions,
  ) => ReturnType<typeof verifyAccessToken>;
}

type BearerHeader =
  | { kind: 'none' }
  | { kind: 'other' }
  | { kind: 'invalid' }
  | {
      kind: 'bearer';
      token: string;
    };

export type SessionResolver = (request: Request) => Promise<SessionUser | null>;
export type IdentityResolver = (request: Request) => Promise<Identity | null>;

function authConfiguration(env: Readonly<Record<string, string | undefined>>) {
  const publicEnv = parsePublicEnv(env);
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || key === undefined) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Le service d’authentification n’est pas configuré.');
  }
  return { url, key };
}

export const supabaseSessionResolver: SessionResolver = async (request) => {
  const { url, key } = authConfiguration(process.env);
  const cookies = parseCookieHeader(request.headers.get('cookie') ?? '').map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
  }));
  if (cookies.length === 0) return null;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookies,
      setAll: () => undefined,
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error !== null) return null;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    emailConfirmed: data.user.email_confirmed_at !== undefined,
  };
};

function bearerHeader(request: Request): BearerHeader {
  const value = request.headers.get('authorization');
  if (value === null) return { kind: 'none' };
  if (!/^Bearer\b/i.test(value)) return { kind: 'other' };
  const match = /^Bearer[ \t]+(\S+)$/i.exec(value);
  if (match?.[1] === undefined) return { kind: 'invalid' };
  return { kind: 'bearer', token: match[1] };
}

function identityFromClaims(claims: JWTPayload, transport: Identity['transport']): Identity | null {
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
  return {
    userId: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    emailConfirmed: claims.email_confirmed_at !== false,
    claims,
    transport,
  };
}

async function freshBearerIdentity(
  token: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<Identity | null> {
  const { url, key } = authConfiguration(env);
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error !== null) return null;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    emailConfirmed: data.user.email_confirmed_at !== undefined,
    claims: { sub: data.user.id, aud: 'authenticated', email: data.user.email },
    transport: 'bearer',
  };
}

let resolver: SessionResolver = supabaseSessionResolver;
let identityOverride: IdentityResolver | undefined;
let freshIdentityOverride: IdentityResolver | undefined;

export async function resolveIdentity(
  request: Request,
  dependencies: IdentityDependencies = {},
): Promise<Identity | null> {
  if (identityOverride !== undefined && dependencies.env === undefined) {
    return identityOverride(request);
  }
  const env = dependencies.env ?? process.env;
  const bearer = bearerHeader(request);
  if (bearer.kind === 'invalid') return null;
  if (bearer.kind === 'bearer') {
    const { url } = authConfiguration(env);
    const explicitJwksUrl = env.SUPABASE_JWKS_URL;
    const jwksUrl =
      explicitJwksUrl ??
      (env.SUPABASE_JWT_SECRET === undefined
        ? `${url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`
        : undefined);
    const verifyToken = dependencies.verifyToken ?? verifyAccessToken;
    const verified = await verifyToken(bearer.token, {
      issuer: `${url.replace(/\/$/, '')}/auth/v1`,
      now: dependencies.now ?? (() => clock.now()),
      ...(env.SUPABASE_JWT_SECRET === undefined ? {} : { jwtSecret: env.SUPABASE_JWT_SECRET }),
      ...(jwksUrl === undefined ? {} : { jwksUrl }),
      ...(dependencies.fetcher === undefined ? {} : { fetcher: dependencies.fetcher }),
    });
    if (verified.status === 'valid') return identityFromClaims(verified.claims, 'bearer');
    if (verified.status === 'invalid') return null;
    warnJwtVerificationUnavailable(
      dependencies.now === undefined ? clock.now() : dependencies.now(),
    );
    return freshBearerIdentity(bearer.token, env);
  }

  const session = await resolver(request);
  if (session === null) return null;
  return {
    ...session,
    claims: { sub: session.userId, aud: 'authenticated', email: session.email },
    transport: 'cookie',
  };
}

/**
 * Rechecks the Auth account for a bearer access token. Cookie sessions have already been checked
 * by `auth.getUser()` during their resolution and are deliberately not contacted a second time.
 */
export async function resolveFreshIdentity(
  request: Request,
  identity: Identity,
): Promise<Identity | null> {
  if (freshIdentityOverride !== undefined) return freshIdentityOverride(request);
  if (identity.transport === 'cookie') return identity;
  const bearer = bearerHeader(request);
  if (bearer.kind !== 'bearer') return null;
  return freshBearerIdentity(bearer.token, process.env);
}

export function getSessionUser(request: Request): Promise<SessionUser | null> {
  return resolver(request);
}

/** Replaces the cookie resolver (existing route tests); returns a function restoring the default. */
export function setSessionResolver(next: SessionResolver): () => void {
  resolver = next;
  return () => {
    resolver = supabaseSessionResolver;
  };
}

export function setIdentityResolver(next: IdentityResolver): () => void {
  identityOverride = next;
  return () => {
    identityOverride = undefined;
  };
}

export function setFreshIdentityResolver(next: IdentityResolver): () => void {
  freshIdentityOverride = next;
  return () => {
    freshIdentityOverride = undefined;
  };
}
