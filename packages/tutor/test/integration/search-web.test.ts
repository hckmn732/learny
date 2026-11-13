// Integration of the web search tool and its suggestions (SPEC-512 CA-1 to CA-4; §12).
//
// Postgres is real: RLS policies, two isolated learners, the real model resolution and committed
// fixtures. Providers are simulated (`LLM_MODE=mock`); no network call is made and every account is
// removed at the end.
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { SearchWebOutput } from '@learny/contracts';
import type { Clock } from '@learny/core';
import { createLogCapture, createLogger } from '@learny/core/server';
import {
  closeDb,
  createCredential,
  serviceDb,
  setTaskModel,
  sql,
  upsertSubscription,
  userDb,
} from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { createProviderSearch } from '@learny/llm';

import {
  decideResourceSuggestion,
  listResourceSuggestions,
  suggestResource,
  type ResourceSuggestionContext,
} from '../../src/services/resource-suggestions';
import { searchWeb, type SearchWebContext } from '../../src/tools/search-web';

const PREFIX = 'sdd-512-';
const FUTURE = new Date('2026-12-11T12:20:00.000Z');
const MOCK_KEY = 'tvly-mock';

class FixedClock implements Clock {
  now(): Date {
    return new Date('2026-11-11T12:20:00Z');
  }
}

interface Learner {
  userId: string;
  email: string;
  formationId: string;
  chapterId: string;
  search: SearchWebContext;
  suggestions: ResourceSuggestionContext;
}

const createdUsers: string[] = [];

function silentLogger() {
  return createLogger({ destination: createLogCapture().destination, level: 'silent' });
}

async function learner(
  label: string,
  options: { subscription?: boolean; personalModel?: boolean } = {},
): Promise<Learner> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const created = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
    });
    if (options.subscription === true) {
      await upsertSubscription(tx, {
        userId: user.id,
        status: 'active',
        currentPeriodEnd: FUTURE,
      });
    }
    if (options.personalModel === true) {
      const credential = await createCredential(tx, {
        userId: user.id,
        provider: 'openai',
        label: 'Clé de démonstration',
        baseUrl: 'https://api.openai.com/v1',
        modelIds: ['gpt-demo'],
        encryptedKey: new Uint8Array(29).fill(3),
        keyLast4: 'demo',
        status: 'qualified',
        qualifiedAt: FUTURE,
      });
      await setTaskModel(tx, {
        userId: user.id,
        task: 'programme',
        credentialId: credential.id,
        modelId: 'gpt-demo',
      });
    }
    return { user, programme };
  });
  createdUsers.push(created.user.id);
  const db = userDb({ userId: created.user.id, email: created.user.email });
  const chapterId = created.programme.chapterIds[0];
  if (chapterId === undefined) throw new Error('chapitre de test absent');
  const logger = silentLogger();
  const fixed = new FixedClock();
  return {
    userId: created.user.id,
    email: created.user.email,
    formationId: created.programme.formationId,
    chapterId,
    search: {
      task: 'programme',
      userId: created.user.id,
      // Resolution only: the query is scoped by the explicit user id (SPEC-504 resolve.ts).
      db: serviceDb(),
      mode: 'mock',
      clock: fixed,
      logger,
    },
    suggestions: { userId: created.user.id, db, clock: fixed, logger },
  };
}

afterAll(async () => {
  try {
    if (createdUsers.length > 0) {
      await serviceDb().execute(
        sql`delete from auth.users where id in (${sql.join(
          createdUsers.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );
    }
  } finally {
    await closeDb();
  }
});

describe('[SPEC-512] service', () => {
  it('CA-1 — un abonné recherche via la route native, même schéma validé', async () => {
    const user = await learner('native', { subscription: true });
    const result = await searchWeb(user.search, {
      query: 'programme de révision en douze semaines',
      purpose: 'programme',
      limit: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('anthropic');
    expect(result.value.results.length).toBeGreaterThan(0);
    expect(SearchWebOutput.safeParse(result.value).success).toBe(true);
    for (const entry of result.value.results) {
      expect(entry.provider).toBe('anthropic');
      expect(entry.url.startsWith('https://')).toBe(true);
    }
  });

  it('CA-1 — un modèle personnel non Anthropic bascule sur le repli Tavily', async () => {
    const user = await learner('fallback', { personalModel: true });
    const result = await searchWeb(
      { ...user.search, secrets: { searchApiKey: MOCK_KEY } },
      { query: 'gérer son temps de révision', purpose: 'resource_suggestion', limit: 3 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('tavily');
    expect(result.value.purpose).toBe('resource_suggestion');
    expect(result.value.results.length).toBeGreaterThan(0);
    expect(SearchWebOutput.safeParse(result.value).success).toBe(true);
  });

  it('CL-2 — sans SEARCH_API_KEY, le repli est indisponible et n’invente rien', async () => {
    const user = await learner('no-key', { personalModel: true });
    const result = await searchWeb(
      { ...user.search, secrets: { searchApiKey: null } },
      { query: 'gérer son temps de révision', purpose: 'programme', limit: 3 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SEARCH_UNAVAILABLE');
  });

  it('CA-2 — la tâche cours est refusée avant toute résolution ou requête', async () => {
    const user = await learner('refusal', { subscription: true });
    const result = await searchWeb(
      { ...user.search, task: 'course' },
      { query: 'rédiger un cours', purpose: 'programme', limit: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TOOL_NOT_ALLOWED');
  });

  it('CA-3 — les liens dangereux et les doublons sont exclus, la provenance reste', async () => {
    const user = await learner('unsafe', { subscription: true });
    const tavily = createProviderSearch({
      provider: 'tavily',
      mode: 'mock',
      scenario: 'unsafe',
      apiKey: MOCK_KEY,
    });
    if (!tavily.ok) throw tavily.error;
    const result = await searchWeb(
      { ...user.search, provider: tavily.value },
      { query: 'fractions', purpose: 'programme', limit: 10 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe('tavily');
    expect(result.value.results).toHaveLength(2);
    expect(result.value.results.map((entry) => entry.url)).toEqual([
      'https://ressources.example.org/fractions',
      'https://example.org/page-publique',
    ]);
    expect(result.value.results.every((entry) => entry.provider === 'tavily')).toBe(true);
    expect(JSON.stringify(result.value)).not.toContain('javascript:');
  });

  it('EF-5 — une panne du fournisseur est une erreur explicite sans source', async () => {
    const user = await learner('unavailable', { subscription: true });
    const tavily = createProviderSearch({
      provider: 'tavily',
      mode: 'mock',
      scenario: 'unavailable',
      apiKey: MOCK_KEY,
    });
    if (!tavily.ok) throw tavily.error;
    const result = await searchWeb(
      { ...user.search, provider: tavily.value },
      { query: 'fractions', purpose: 'programme', limit: 5 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SEARCH_UNAVAILABLE');
  });

  it('CA-4 — la suggestion reste en attente, l’import est explicite et la RLS isole les apprenants', async () => {
    const owner = await learner('owner', { subscription: true });
    const other = await learner('other', { subscription: true });

    const before = await serviceDb().execute<{ sections: number; courses: number }>(sql`
      select
        (select count(*)::int from public.course_sections where chapter_id = ${owner.chapterId}::uuid) as sections,
        (select count(*)::int from public.courses where formation_id = ${owner.formationId}::uuid) as courses
    `);

    const created = await suggestResource(owner.suggestions, {
      chapterId: owner.chapterId,
      title: 'Comprendre les fractions — fiche méthode',
      url: 'https://www.ressources.example.org/fractions/?utm_source=news#top',
      reason: 'Une fiche courte pour revoir la notion avant le quiz.',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBe('pending');
    expect(created.value.duplicate).toBe(false);
    expect(created.value.url).toBe('https://ressources.example.org/fractions');
    expect(created.value.createdAt).toBe('2026-11-11T12:20:00.000Z');

    // Replay: the same canonical URL returns the same pending suggestion.
    const replay = await suggestResource(owner.suggestions, {
      chapterId: owner.chapterId,
      title: 'Comprendre les fractions — fiche méthode',
      url: 'https://ressources.example.org/fractions',
      reason: 'Une fiche courte pour revoir la notion avant le quiz.',
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value.id).toBe(created.value.id);
    expect(replay.value.duplicate).toBe(true);

    // RLS: the other learner cannot decide nor list it.
    const denied = await decideResourceSuggestion(other.suggestions, created.value.id, 'import');
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe('NOT_FOUND');
    const otherList = await listResourceSuggestions(other.suggestions, owner.chapterId);
    expect(otherList.ok).toBe(true);
    if (otherList.ok) expect(otherList.value).toEqual([]);

    // The learner imports explicitly.
    const imported = await decideResourceSuggestion(owner.suggestions, created.value.id, 'import');
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.status).toBe('imported');
    const importedAgain = await decideResourceSuggestion(
      owner.suggestions,
      created.value.id,
      'import',
    );
    expect(importedAgain.ok).toBe(true);
    if (importedAgain.ok) expect(importedAgain.value.duplicate).toBe(true);
    const conflicting = await decideResourceSuggestion(
      owner.suggestions,
      created.value.id,
      'dismiss',
    );
    expect(conflicting.ok).toBe(false);
    if (!conflicting.ok) expect(conflicting.error.code).toBe('CONFLICT');

    const listed = await listResourceSuggestions(owner.suggestions, owner.chapterId);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value).toHaveLength(1);
      expect(listed.value[0]?.status).toBe('imported');
      expect(listed.value[0]?.reason).toBe('Une fiche courte pour revoir la notion avant le quiz.');
    }

    // CA-4 — no course or section was created by search or by the import decision.
    const after = await serviceDb().execute<{ sections: number; courses: number }>(sql`
      select
        (select count(*)::int from public.course_sections where chapter_id = ${owner.chapterId}::uuid) as sections,
        (select count(*)::int from public.courses where formation_id = ${owner.formationId}::uuid) as courses
    `);
    expect(after[0]).toEqual(before[0]);

    const rows = await serviceDb().execute<{ origin: string; status: string; url: string }>(sql`
      select origin::text as origin, suggestion_status::text as status, url
      from public.resources where id = ${created.value.id}::uuid
    `);
    expect(rows[0]).toEqual({
      origin: 'tutor_suggestion',
      status: 'imported',
      url: 'https://ressources.example.org/fractions',
    });
  });

  it('CA-3 — une URL privée ne peut pas devenir une suggestion', async () => {
    const owner = await learner('private-url', { subscription: true });
    const result = await suggestResource(owner.suggestions, {
      chapterId: owner.chapterId,
      title: 'Intranet',
      url: 'http://192.168.1.10/notes',
      reason: 'Ne doit jamais être acceptée.',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION_FAILED');
  });
});
