// First verified sign-in of an account (SPEC-202 EF-10, ET-4, ET-5, CL-8; ADR-0121). This is the
// only module of the authentication services that reads `auth.users` and writes with the owner
// role (ADR-0022): the legal acceptances and the time zone given at sign-up are recorded here.
import { LEGAL_VERSIONS } from '@learny/config';
import { isValidIanaZone, type LearnyLogger } from '@learny/core';
import { recordLegalAcceptance, serviceDb, sql } from '@learny/db';
import { inngest } from '@learny/jobs';

import type { ServiceContext } from '../context';

import type { SignupMetadata, SignupMethod } from './client';

export interface SignedUpEvent {
  id: string;
  name: 'user/signed-up';
  data: { userId: string; method: SignupMethod; signedUpAt: string };
}

export type SignedUpEmitter = (event: SignedUpEvent) => Promise<void>;

/** Default emitter: Inngest, deduplicated by the event id. SPEC-203 types the catalogue. */
const inngestEmitter: SignedUpEmitter = async (event) => {
  await inngest.send(event);
};

let emitter: SignedUpEmitter = inngestEmitter;

/** Replaces the emitter (tests); returns a function restoring the default. */
export function setSignedUpEmitter(next: SignedUpEmitter): () => void {
  emitter = next;
  return () => {
    emitter = inngestEmitter;
  };
}

export interface DestinationProfileRow {
  onboardingStep: string;
  deletionScheduledFor: Date | null;
}

export async function loadDestinationProfile(userId: string): Promise<DestinationProfileRow> {
  const rows = await serviceDb().execute<{
    onboarding_step: string;
    deletion_scheduled_for: Date | null;
  }>(sql`
    select onboarding_step::text as onboarding_step, deletion_scheduled_for
    from public.profiles where id = ${userId}::uuid`);
  const row = rows[0];
  // A user without profile cannot exist (trigger); treat it as a fresh account.
  return {
    onboardingStep: row?.onboarding_step ?? 'profil',
    deletionScheduledFor: row?.deletion_scheduled_for ?? null,
  };
}

function readSignup(metadata: unknown): SignupMetadata | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const signup = (metadata as { signup?: unknown }).signup;
  if (typeof signup !== 'object' || signup === null) return null;
  const value = signup as Record<string, unknown>;
  if (
    typeof value.termsAcceptedAt !== 'string' ||
    Number.isNaN(Date.parse(value.termsAcceptedAt))
  ) {
    return null;
  }
  return {
    termsAcceptedAt: value.termsAcceptedAt,
    cguVersion: typeof value.cguVersion === 'string' ? value.cguVersion : LEGAL_VERSIONS.cgu,
    privacyVersion:
      typeof value.privacyVersion === 'string' ? value.privacyVersion : LEGAL_VERSIONS.privacy,
    method: value.method === 'password' ? 'password' : 'magic_link',
    ...(typeof value.timezone === 'string' ? { timezone: value.timezone } : {}),
  };
}

export interface FinalizeResult {
  firstTime: boolean;
}

/**
 * Idempotent: the profile row is locked, so two concurrent verifications record one pair of
 * acceptances and emit one event (the event id is deduplicated by Inngest as well).
 */
export async function finalizeFirstVerification(
  ctx: Pick<ServiceContext, 'clock' | 'logger'>,
  userId: string,
  fallbackMethod: SignupMethod,
): Promise<FinalizeResult> {
  const outcome = await serviceDb().transaction(async (tx) => {
    await tx.execute(sql`select 1 from public.profiles where id = ${userId}::uuid for update`);
    const existing = await tx.execute<{ count: number }>(sql`
      select count(*)::int as count from public.legal_acceptances where user_id = ${userId}::uuid`);
    if ((existing[0]?.count ?? 0) > 0) return null;

    const users = await tx.execute<{ meta: unknown }>(sql`
      select raw_user_meta_data as meta from auth.users where id = ${userId}::uuid`);
    const signup = readSignup(users[0]?.meta);
    if (signup === null) return null;

    const acceptedAt = new Date(signup.termsAcceptedAt);
    await recordLegalAcceptance(tx, {
      userId,
      document: 'cgu',
      version: signup.cguVersion,
      acceptedAt,
    });
    await recordLegalAcceptance(tx, {
      userId,
      document: 'privacy',
      version: signup.privacyVersion,
      acceptedAt,
    });

    let timezone: string | null = null;
    if (signup.timezone !== undefined && isValidIanaZone(signup.timezone)) {
      const known = await tx.execute<{ ok: boolean }>(sql`
        select exists (select 1 from pg_catalog.pg_timezone_names where name = ${signup.timezone})
          as ok`);
      if (known[0]?.ok === true) timezone = signup.timezone;
    }
    await tx.execute(sql`
      update public.profiles
      set terms_version = ${`cgu:${signup.cguVersion};privacy:${signup.privacyVersion}`},
          terms_accepted_at = ${acceptedAt.toISOString()}::timestamptz,
          timezone = coalesce(${timezone}, timezone)
      where id = ${userId}::uuid`);
    return signup;
  });

  if (outcome === null) return { firstTime: false };
  await emitSignedUp(ctx, userId, outcome.method === 'password' ? 'password' : fallbackMethod);
  return { firstTime: true };
}

async function emitSignedUp(
  ctx: Pick<ServiceContext, 'clock' | 'logger'>,
  userId: string,
  method: SignupMethod,
): Promise<void> {
  const logger: LearnyLogger = ctx.logger;
  try {
    await emitter({
      id: `user-signed-up:${userId}`,
      name: 'user/signed-up',
      data: { userId, method, signedUpAt: ctx.clock.now().toISOString() },
    });
  } catch (error) {
    // Signing in never fails because the event bus is down; the event can be replayed by its id.
    logger.error('user/signed-up not emitted', { code: 'SERVICE_UNAVAILABLE' }, error);
  }
}
