// Data of the SPEC-512 demonstration: two simulated provider routes, the refusal for `course`, and
// the isolated learner used by the suggestion actions. No real provider is called in the browser.
import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  SearchWebOutput,
  SearchWebQuery,
  type SearchWebProvider,
  type SearchWebResult,
} from '@learny/contracts';
import { serviceDb, sql, userDb } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { createProviderSearch, plainText } from '@learny/llm';
import { searchWeb } from '@learny/tutor';

const PREFIX = 'sdd-512-';
export const DEMO_EMAIL = `${PREFIX}demo@test.learny.test`;
const DEMO_KEY = process.env.SEARCH_API_KEY ?? 'tvly-demo';

export interface RouteDemo {
  provider: SearchWebProvider;
  results: SearchWebResult[];
  limited: boolean;
  message: string | null;
}

export interface SearchWebDemo {
  routes: Record<SearchWebProvider, RouteDemo>;
  refusal: { code: string; message: string };
  unavailable: { code: string; message: string };
  input: unknown;
  validated: SearchWebOutput;
}

const QUERY = 'programme de révision en douze semaines';
const SEARCH_INPUT = { query: QUERY, purpose: 'programme', limit: 5 } as const;

async function route(provider: SearchWebProvider): Promise<RouteDemo> {
  const client = createProviderSearch({
    provider,
    mode: 'mock',
    ...(provider === 'tavily' ? { apiKey: DEMO_KEY } : {}),
  });
  if (!client.ok) throw client.error;
  const result = await searchWeb(
    { task: 'programme', userId: 'sdd-512-demo', mode: 'mock', provider: client.value },
    SEARCH_INPUT,
  );
  if (!result.ok) throw result.error;
  return {
    provider: result.value.provider,
    results: result.value.results,
    limited: result.value.limited,
    message: result.value.message,
  };
}

/** Creates (or reuses) the isolated demonstration learner and resets its suggestions. */
export async function demoLearner(reset: boolean): Promise<{ userId: string; chapterId: string }> {
  const rows = await serviceDb().execute<{ id: string }>(
    sql`select id::text as id from auth.users where email = ${DEMO_EMAIL} limit 1`,
  );
  let userId = rows[0]?.id;
  if (userId === undefined) {
    userId = await serviceDb().transaction(async (tx) => {
      const user = await createTestUser(tx, { email: DEMO_EMAIL });
      await createTestProgramme(tx, user.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
        title: 'Formation de démonstration SPEC-512',
      });
      return user.id;
    });
  }
  if (reset) {
    await serviceDb().execute(
      sql`delete from public.resources where owner_id = ${userId}::uuid and origin = 'tutor_suggestion'`,
    );
  }
  const chapters = await serviceDb().execute<{ id: string }>(sql`
    select c.id::text as id
    from public.chapters c
    join public.formations f on f.id = c.formation_id
    where f.owner_id = ${userId}::uuid
    order by c.position
    limit 1
  `);
  const chapterId = chapters[0]?.id;
  if (chapterId === undefined) throw new Error('chapitre de démonstration absent');
  return { userId, chapterId };
}

export async function demoSuggestionContext(): Promise<{
  userId: string;
  chapterId: string;
  db: ReturnType<typeof userDb>;
}> {
  const { userId, chapterId } = await demoLearner(false);
  return { userId, chapterId, db: userDb({ userId }) };
}

export async function loadSearchWebDemo(): Promise<SearchWebDemo> {
  await demoLearner(true);
  const [anthropic, tavily] = await Promise.all([route('anthropic'), route('tavily')]);
  const refusal = await searchWeb(
    { task: 'course', userId: 'sdd-512-demo', mode: 'mock' },
    SEARCH_INPUT,
  );
  const unavailable = await searchWeb(
    {
      task: 'programme',
      userId: 'sdd-512-demo',
      mode: 'mock',
      providerName: 'tavily',
      secrets: { searchApiKey: null },
    },
    SEARCH_INPUT,
  );
  if (refusal.ok || unavailable.ok) throw new Error('refus de démonstration attendu');
  return {
    routes: { anthropic, tavily },
    refusal: { code: refusal.error.code, message: refusal.error.detail },
    unavailable: { code: unavailable.error.code, message: unavailable.error.detail },
    input: z.toJSONSchema(SearchWebQuery, { io: 'input' }),
    validated: SearchWebOutput.parse({
      query: QUERY,
      purpose: 'programme',
      provider: anthropic.provider,
      results: anthropic.results,
      limited: anthropic.limited,
      message: anthropic.message,
    }),
  };
}

export function newDemoRequestId(): string {
  return `${PREFIX}${randomUUID()}`;
}

export function safePlainText(value: string): string {
  return plainText(value);
}
