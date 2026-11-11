// The single Inngest client of the monorepo (ADR-0017).
import { Inngest } from 'inngest';

export const INNGEST_APP_ID = 'learny';

type Env = Readonly<Record<string, string | undefined>>;

// Production never runs in Dev Server mode: signature verification stays on (EF-2).
export function createLearnyClient(env: Env = process.env): Inngest {
  const production = env.APP_ENV === 'production';
  const signingKey = env.INNGEST_SIGNING_KEY;
  return new Inngest({
    id: INNGEST_APP_ID,
    ...(production ? { isDev: false } : {}),
    ...(signingKey !== undefined && signingKey !== '' ? { signingKey } : {}),
  });
}

export const inngest = createLearnyClient();
