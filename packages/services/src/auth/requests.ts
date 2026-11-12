// Authentication requests (SPEC-202 ET-4): magic link, password sign-up and sign-in, resend.
import { LEGAL_VERSIONS } from '@learny/config';
import type { MagicLinkInput, ResendInput, SignInInput, SignUpInput } from '@learny/contracts';
import { AppError, err, ok, type Result } from '@learny/core';

import type { ServiceContext } from '../context';

import { callbackUrl, type AuthDeps, type SignupMetadata, type SignupMethod } from './client';
import { resolvePostAuthDestination } from './destination';
import { loadDestinationProfile, finalizeFirstVerification } from './finalize';
import { mapGotrueError } from './gotrue-errors';

function signupMetadata(
  ctx: ServiceContext,
  method: SignupMethod,
  timezone: string | undefined,
): { signup: SignupMetadata } {
  return {
    signup: {
      termsAcceptedAt: ctx.clock.now().toISOString(),
      cguVersion: LEGAL_VERSIONS.cgu,
      privacyVersion: LEGAL_VERSIONS.privacy,
      method,
      ...(timezone === undefined ? {} : { timezone }),
    },
  };
}

/** EF-1, EF-2 — sign-up creates the account, sign-in never creates one; always the same answer. */
export async function requestMagicLink(
  ctx: ServiceContext,
  input: MagicLinkInput,
  deps: AuthDeps,
): Promise<Result<undefined>> {
  const emailRedirectTo = callbackUrl(deps.appUrl);
  const signUp = input.mode === 'sign-up';
  const { error } = await deps.auth.signInWithOtp({
    email: input.email,
    options: {
      shouldCreateUser: signUp,
      emailRedirectTo,
      ...(input.mode === 'sign-up'
        ? { data: signupMetadata(ctx, 'magic_link', input.timezone) }
        : {}),
    },
  });
  if (error === null) return ok(undefined);
  const outcome = mapGotrueError(error, { silentWhenUnknownUser: !signUp });
  if (outcome.kind === 'silent') {
    ctx.logger.info('magic link requested for an unknown address', { outcome: 'silent' });
    return ok(undefined);
  }
  return err(outcome.error);
}

/** EF-3 — password sign-up; an address already registered gets the same answer (ET-8). */
export async function signUpWithPassword(
  ctx: ServiceContext,
  input: SignUpInput,
  deps: AuthDeps,
): Promise<Result<{ status: 'confirmation_sent' }>> {
  const { error } = await deps.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: callbackUrl(deps.appUrl),
      data: signupMetadata(ctx, 'password', input.timezone),
    },
  });
  if (error !== null) {
    const outcome = mapGotrueError(error, { silentWhenAlreadyRegistered: true });
    if (outcome.kind === 'error') return err(outcome.error);
  }
  return ok({ status: 'confirmation_sent' });
}

/** EF-4 — password sign-in; the session cookies are written by the Auth client. */
export async function signInWithPassword(
  ctx: ServiceContext,
  input: SignInInput,
  deps: AuthDeps,
): Promise<Result<{ destination: string }>> {
  const { data, error } = await deps.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error !== null) {
    const outcome = mapGotrueError(error);
    return err(outcome.kind === 'error' ? outcome.error : unavailable());
  }
  const userId = data.user.id;
  await finalizeFirstVerification(ctx, userId, 'password');
  const profile = await loadDestinationProfile(userId);
  return ok({ destination: resolvePostAuthDestination(profile, input.next) });
}

/** EF-5 — resend; GoTrue refuses a second sending within 60 s (`max_frequency`). */
export async function resendLink(
  _ctx: ServiceContext,
  input: ResendInput,
  deps: AuthDeps,
): Promise<Result<undefined>> {
  const emailRedirectTo = callbackUrl(deps.appUrl);
  const { error } =
    input.kind === 'signup'
      ? await deps.auth.resend({ type: 'signup', email: input.email, options: { emailRedirectTo } })
      : await deps.auth.signInWithOtp({
          email: input.email,
          options: { shouldCreateUser: false, emailRedirectTo },
        });
  if (error === null) return ok(undefined);
  const outcome = mapGotrueError(error, { silentWhenUnknownUser: true });
  return outcome.kind === 'silent' ? ok(undefined) : err(outcome.error);
}

/** EF-7, CL-10 — closes the session; without a session it is a no-op. */
export async function signOut(deps: AuthDeps): Promise<void> {
  await deps.auth.signOut();
}

function unavailable(): AppError {
  return new AppError(
    'SERVICE_UNAVAILABLE',
    'Le service d’authentification est momentanément indisponible.',
  );
}
