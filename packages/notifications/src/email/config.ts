// E-mail configuration read from the validated server environment (SPEC-204 §3, SPEC-009).
// `EMAIL_MODE=resend` without `RESEND_API_KEY` fails here, when the transport is first built: the
// mode matrix of SPEC-009 keeps `preview` defaults loadable without a key, the sender does not.
import { parseServerEnv, type EmailMode } from '@learny/config/server';

export interface EmailConfig {
  mode: EmailMode;
  from: string;
  appUrl: string;
  linkSecret: string;
  smtp: { host: string; port: number };
  resendApiKey: string | undefined;
  isProduction: boolean;
}

export const DEFAULT_EMAIL_FROM = 'Learny <bonjour@learny.app>';
export const DEFAULT_APP_URL = 'http://localhost:3000';
// Development value of `.env.example` (learny-test-only): refused in production by the env schema,
// which requires an explicit EMAIL_LINK_SECRET there.
const DEV_LINK_SECRET = 'learny-test-only-email-link-secret-00000000';

type Env = Readonly<Record<string, string | undefined>>;

let cached: EmailConfig | undefined;

export function readEmailConfig(env: Env = process.env): EmailConfig {
  const server = parseServerEnv(env);
  const isProduction = server.APP_ENV === 'production';
  const linkSecret = server.EMAIL_LINK_SECRET ?? (isProduction ? undefined : DEV_LINK_SECRET);
  if (linkSecret === undefined) {
    throw new Error('Configuration e-mail invalide : EMAIL_LINK_SECRET est obligatoire.');
  }
  if (server.EMAIL_MODE === 'resend' && server.RESEND_API_KEY === undefined) {
    throw new Error('Configuration e-mail invalide : EMAIL_MODE=resend exige RESEND_API_KEY.');
  }
  return {
    mode: server.EMAIL_MODE,
    from: server.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
    appUrl: (server.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL).replace(/\/+$/, ''),
    linkSecret,
    smtp: { host: server.SMTP_HOST ?? '127.0.0.1', port: server.SMTP_PORT ?? 1025 },
    resendApiKey: server.RESEND_API_KEY,
    isProduction,
  };
}

/** Configuration of the process, validated once. */
export function emailConfig(): EmailConfig {
  cached ??= readEmailConfig();
  return cached;
}

/** Forgets the memoised configuration (tests switching environments). */
export function resetEmailConfig(): void {
  cached = undefined;
}
