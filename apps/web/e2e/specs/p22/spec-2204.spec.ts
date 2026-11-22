// [SPEC-2204] The tutor context served by the Python facade, end to end through the web. The
// functional test consumes the real SSE stream (route, pipeline, handler, writer) with a real
// session and a seeded ready course, then exercises the seven BYOK operations the Python slice
// flipped. It is the twin of the onboarding (SPEC-602) and models-tab (SPEC-709) e2e rows of
// `evidence/SPEC-2001/test-port-map.md`: the same contracts, through the Python backend.
import { randomBytes } from 'node:crypto';

import { serviceDb } from '@learny/db';
import { createCourse, createFormation, createModule } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession } from '@learny/testing/supabase';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3100';
const DEMO = '/_dev/sdd/SPEC-2204';
const MODEL = 'gpt-5-mini';
// A dummy key: the mock adapter never opens a socket, and the assertions check that no fragment
// of it beyond the last four characters ever leaves the server.
const API_KEY = `sk-spec2204-${randomBytes(6).toString('hex')}`;
const DISCOVERY_KEY = `sk-spec2204-discovery-${randomBytes(6).toString('hex')}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('sert les conversations, le flux SSE et les clés personnelles depuis Python @SPEC-2204', async ({
  request,
  baseURL,
}) => {
  const origin = baseURL ?? DEFAULT_ORIGIN;
  const session = await createTestSession();
  try {
    // A real learner with a ready course: the conversation, its context and the greeting are read
    // under this session's RLS claims, exactly like the screen does.
    const seeded = await serviceDb().transaction(async (tx) => {
      const formation = await createFormation(tx, {
        ownerId: session.userId,
        title: 'Formation du tuteur',
        status: 'active',
        startDate: '2026-11-02',
        endDate: '2026-12-20',
      });
      const createdModule = await createModule(tx, {
        ownerId: session.userId,
        formationId: formation.id,
        position: 1,
        title: 'Module du tuteur',
        chapters: ['Chapitre du tuteur'],
        plannedStart: '2026-11-02',
        plannedEnd: '2026-11-15',
        status: 'open',
      });
      const course = await createCourse(tx, {
        ownerId: session.userId,
        formationId: formation.id,
        moduleId: createdModule.id,
      });
      return { courseId: course.id, chapterId: createdModule.chapterIds[0] ?? '' };
    });
    expect(seeded.chapterId).not.toBe('');

    // The `request` fixture does not share the browser context cookies: they are sent explicitly.
    // The origin header keeps the SPEC-208 guard satisfied on every mutation, and an idempotent
    // route needs its `idempotency-key`.
    const headers = { cookie: session.cookieHeader, origin };
    const idempotent = (suffix: string) => ({
      ...headers,
      'idempotency-key': `spec-2204-${suffix}-${session.userId}`,
    });

    // CA-1, CA-5 — courses.conversations.create: the conversation, the greeting composed by the
    // code and the context keys, all served by Python.
    const created = await request.post(`/api/v1/courses/${seeded.courseId}/conversations`, {
      headers: idempotent('conversation'),
      data: { chapterId: seeded.chapterId },
    });
    const createdPayload = await created.text();
    expect(created.status(), createdPayload).toBe(201);
    expect(created.headers()['x-served-by']).toBe('learny-api');
    const conversation = JSON.parse(createdPayload) as {
      id: string;
      courseId: string;
      chapterId: string;
      title: string | null;
      messages: { role: string; content: string }[];
      contextItems: { key: string; included: boolean }[];
      pendingSelfTest: boolean;
    };
    expect(conversation.id).toMatch(UUID);
    expect(conversation.courseId).toBe(seeded.courseId);
    expect(conversation.chapterId).toBe(seeded.chapterId);
    expect(conversation.title).toBeNull();
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]?.role).toBe('tutor');
    expect(conversation.messages[0]?.content.length ?? 0).toBeGreaterThan(0);
    // No gap and no passage for this learner: formation, chapter, resources and profile are the
    // four keys the prompt can receive.
    expect(conversation.contextItems.map((item) => item.key)).toEqual([
      'formation',
      'chapter',
      'resources',
      'profile',
    ]);
    expect(conversation.pendingSelfTest).toBe(false);

    // CA-1, CA-5 — courses.conversations.list: the conversation just opened is listed.
    const listed = await request.get(`/api/v1/courses/${seeded.courseId}/conversations`, {
      headers,
    });
    const listedPayload = await listed.text();
    expect(listed.status(), listedPayload).toBe(200);
    expect(listed.headers()['x-served-by']).toBe('learny-api');
    const list = JSON.parse(listedPayload) as { items: { id: string; title: string | null }[] };
    expect(list.items.map((item) => item.id)).toContain(conversation.id);

    // CA-1, CA-5 — conversations.messages: the SSE body is read whole (the writer closes it) and
    // then split into its frames, so the order and the framing are those of the wire.
    const stream = await request.post(`/api/v1/conversations/${conversation.id}/messages`, {
      headers,
      data: { text: 'Bonjour', context: { include: {} } },
    });
    const body = await stream.text();
    expect(stream.status(), body).toBe(200);
    expect(stream.headers()['x-served-by']).toBe('learny-api');
    expect(stream.headers()['x-vercel-ai-ui-message-stream']).toBe('v1');
    expect(stream.headers()['content-type']).toContain('text/event-stream');
    expect(stream.headers()['cache-control']).toBe('no-store');
    expect(stream.headers()['x-request-id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(body.endsWith('data: [DONE]\n\n')).toBe(true);

    const frames = body.split('\n\n').filter((frame) => frame !== '');
    expect(frames.at(-1)).toBe('data: [DONE]');
    const events = frames.slice(0, -1).map((frame) => {
      expect(frame.startsWith('data: {')).toBe(true);
      return JSON.parse(frame.slice('data: '.length)) as {
        type: string;
        messageId?: string;
        id?: string;
        delta?: string;
        data?: unknown;
      };
    });
    const types = events.map((event) => event.type);
    const last = types.length - 1;
    // AI SDK UI message stream v1: start, text-start, deltas, text-end, sources, follow-ups,
    // finish — and `[DONE]` after it, never inside.
    expect(types[0]).toBe('start');
    expect(types[1]).toBe('text-start');
    expect(types[last - 3]).toBe('text-end');
    expect(types[last - 2]).toBe('data-sources');
    expect(types[last - 1]).toBe('data-follow-ups');
    expect(types[last]).toBe('finish');
    expect(types.slice(2, last - 3).every((type) => type === 'text-delta')).toBe(true);
    expect(types.slice(2, last - 3).length).toBeGreaterThan(0);
    expect(types.filter((type) => type === 'finish')).toHaveLength(1);
    expect(events[0]?.messageId).toMatch(UUID);
    expect(events.filter((event) => event.type === 'text-delta').every((e) => e.id === 'tutor')).toBe(
      true,
    );

    const answer = events
      .filter((event) => event.type === 'text-delta')
      .map((event) => event.delta ?? '')
      .join('');
    expect(answer.length).toBeGreaterThan(0);
    // The `[[sources:...]]` marker never reaches the client: it is filtered and resolved.
    expect(answer).not.toContain('[[sources:');
    const emittedSources = (
      events.find((event) => event.type === 'data-sources')?.data as {
        sources: { label: string }[];
      }
    ).sources;
    expect(emittedSources.length).toBeGreaterThan(0);
    expect(emittedSources.every((source) => source.label.length > 0)).toBe(true);
    const emittedFollowUps = (
      events.find((event) => event.type === 'data-follow-ups')?.data as {
        followUps: { key: string; label: string }[];
      }
    ).followUps;
    expect(emittedFollowUps.length).toBeGreaterThan(0);

    // CA-1, CA-5 — conversations.get: the learner message and the complete answer were persisted,
    // with the same sources and follow-ups that the stream announced.
    const read = await request.get(`/api/v1/conversations/${conversation.id}`, { headers });
    const readPayload = await read.text();
    expect(read.status(), readPayload).toBe(200);
    expect(read.headers()['x-served-by']).toBe('learny-api');
    const persisted = JSON.parse(readPayload) as {
      title: string | null;
      pendingSelfTest: boolean;
      messages: {
        role: string;
        content: string;
        sources: { label: string }[];
        followUps: { key: string; label: string }[];
      }[];
    };
    expect(persisted.title).toBe('Bonjour');
    expect(persisted.messages.map((message) => message.role)).toEqual([
      'tutor',
      'learner',
      'tutor',
    ]);
    expect(persisted.messages[1]?.content).toBe('Bonjour');
    expect(persisted.messages[2]?.content).toBe(answer);
    expect(persisted.messages[2]?.sources).toEqual(emittedSources);
    expect(persisted.messages[2]?.followUps).toEqual(emittedFollowUps);
    expect(persisted.pendingSelfTest).toBe(false);

    // CA-1, CA-5 — me.ai.credentials.create: the key is stored encrypted and only the mask comes
    // back; the creation probe dates the connection.
    const credential = await request.post('/api/v1/me/ai/credentials', {
      headers: idempotent('credential'),
      data: { provider: 'openai', modelIds: [MODEL], apiKey: API_KEY },
    });
    const credentialPayload = await credential.text();
    expect(credential.status(), credentialPayload).toBe(201);
    expect(credential.headers()['x-served-by']).toBe('learny-api');
    const card = JSON.parse(credentialPayload) as {
      id: string;
      provider: string;
      providerLabel: string;
      keyMasked: string;
      status: string;
      connectionStatus: string;
      outsideEu: boolean;
      dataNote: string;
      modelIds: string[];
      qualifiedAt: string | null;
      createdAt: string;
    };
    expect(card.id).toMatch(UUID);
    expect(card.provider).toBe('openai');
    expect(card.providerLabel.length).toBeGreaterThan(0);
    expect(card.keyMasked).toBe(`sk-${'•'.repeat(8)}${API_KEY.slice(-4)}`);
    expect(card.keyMasked).not.toContain(API_KEY.slice(4, -4));
    expect(card.status).toBe('untested');
    expect(card.connectionStatus).toBe('connected');
    expect(card.outsideEu).toBe(true);
    expect(card.dataNote.length).toBeGreaterThan(0);
    expect(card.modelIds).toEqual([MODEL]);
    expect(card.qualifiedAt).toBeNull();
    expect(card.createdAt).toMatch(/Z$/);
    expect(credentialPayload).not.toContain(API_KEY);
    expect(credentialPayload).not.toContain('encryptedKey');

    // CA-1, CA-5 — me.ai.credentials.list: the masked card is returned, never the key.
    const credentials = await request.get('/api/v1/me/ai/credentials', { headers });
    const credentialsPayload = await credentials.text();
    expect(credentials.status(), credentialsPayload).toBe(200);
    expect(credentials.headers()['x-served-by']).toBe('learny-api');
    const items = (JSON.parse(credentialsPayload) as { items: { id: string; keyMasked: string }[] })
      .items;
    expect(items.map((item) => item.id)).toEqual([card.id]);
    expect(items[0]?.keyMasked).toBe(card.keyMasked);
    expect(credentialsPayload).not.toContain(API_KEY);

    // CA-1, CA-5 — me.ai.credentials.discover: the simulated catalogue of the provider, no key
    // echoed and no socket opened.
    const discovered = await request.post('/api/v1/me/ai/credentials/discover', {
      headers,
      data: { provider: 'openai', apiKey: DISCOVERY_KEY },
    });
    const discoveredPayload = await discovered.text();
    expect(discovered.status(), discoveredPayload).toBe(200);
    expect(discovered.headers()['x-served-by']).toBe('learny-api');
    const modelIds = (JSON.parse(discoveredPayload) as { modelIds: string[] }).modelIds;
    expect(modelIds.length).toBeGreaterThan(0);
    expect(discoveredPayload).not.toContain(DISCOVERY_KEY);

    // CA-1, CA-5 — me.ai.credentials.qualify: the non-blocking compatibility probe of the tutor
    // task reports its required capabilities, without any reserve for the mock provider.
    const qualification = await request.post(
      `/api/v1/me/ai/credentials/${card.id}/qualify`,
      { headers, data: { modelId: MODEL, task: 'tutor' } },
    );
    const qualificationPayload = await qualification.text();
    expect(qualification.status(), qualificationPayload).toBe(200);
    expect(qualification.headers()['x-served-by']).toBe('learny-api');
    const report = JSON.parse(qualificationPayload) as {
      status: string;
      task: string;
      modelId: string;
      credentialId: string;
      requiredCapabilities: string[];
      reserveCodes: string[];
      reasons: unknown[];
      checkedAt: string;
    };
    expect(report.status).toBe('compatible');
    expect(report.task).toBe('tutor');
    expect(report.modelId).toBe(MODEL);
    expect(report.credentialId).toBe(card.id);
    expect(report.requiredCapabilities).toEqual(['tools', 'structured']);
    expect(report.reserveCodes).toEqual([]);
    expect(report.reasons).toEqual([]);
    expect(report.checkedAt).toMatch(/Z$/);
    expect(qualificationPayload).not.toContain(API_KEY);

    // CA-1, CA-5 — me.ai.models.get: the five tasks of the models tab, in prototype order, all
    // without an assignment, and the masked card of the new key.
    const models = await request.get('/api/v1/me/ai/models', { headers });
    const modelsPayload = await models.text();
    expect(models.status(), modelsPayload).toBe(200);
    expect(models.headers()['x-served-by']).toBe('learny-api');
    const state = JSON.parse(modelsPayload) as {
      tasks: {
        task: string;
        modelId: string | null;
        available: boolean;
        unavailableReason: string | null;
      }[];
      providers: { keyMasked: string; status: string }[];
      updatedAt: string;
    };
    expect(state.tasks.map((task) => task.task)).toEqual([
      'programme',
      'course',
      'gaps',
      'tutor',
      'light',
    ]);
    expect(state.tasks.every((task) => task.modelId === null)).toBe(true);
    expect(state.tasks.every((task) => !task.available)).toBe(true);
    expect(state.tasks.every((task) => task.unavailableReason === 'no_model_selected')).toBe(true);
    expect(state.providers).toHaveLength(1);
    expect(state.providers[0]?.keyMasked).toBe(card.keyMasked);
    expect(state.updatedAt).toMatch(/Z$/);
    expect(modelsPayload).not.toContain(API_KEY);

    // CA-1, CA-5 — me.ai.models.update: the assignment is immediate and carries the stored
    // compatibility; clearing it leaves no fallback behind.
    const assigned = await request.patch('/api/v1/me/ai/models', {
      headers: idempotent('models-assign'),
      data: { action: 'assign', task: 'tutor', credentialId: card.id, modelId: MODEL },
    });
    const assignedPayload = await assigned.text();
    expect(assigned.status(), assignedPayload).toBe(200);
    expect(assigned.headers()['x-served-by']).toBe('learny-api');
    const assignedTutor = (
      JSON.parse(assignedPayload) as {
        tasks: { task: string; modelId: string | null; available: boolean; provider: string }[];
      }
    ).tasks.find((task) => task.task === 'tutor');
    expect(assignedTutor).toMatchObject({
      task: 'tutor',
      modelId: MODEL,
      available: true,
      provider: 'openai',
    });

    const cleared = await request.patch('/api/v1/me/ai/models', {
      headers: idempotent('models-clear'),
      data: { action: 'clear', task: 'tutor' },
    });
    const clearedPayload = await cleared.text();
    expect(cleared.status(), clearedPayload).toBe(200);
    expect(cleared.headers()['x-served-by']).toBe('learny-api');
    const clearedTutor = (
      JSON.parse(clearedPayload) as { tasks: { task: string; modelId: string | null }[] }
    ).tasks.find((task) => task.task === 'tutor');
    expect(clearedTutor?.modelId).toBeNull();

    // CA-1, CA-5 — me.ai.credentials.delete: a 204, then an empty list; nothing of the key
    // survives for this learner.
    const removed = await request.delete(`/api/v1/me/ai/credentials/${card.id}`, { headers });
    expect(removed.status()).toBe(204);
    expect(removed.headers()['x-served-by']).toBe('learny-api');

    const afterDelete = await request.get('/api/v1/me/ai/credentials', { headers });
    const afterDeletePayload = await afterDelete.text();
    expect(afterDelete.status(), afterDeletePayload).toBe(200);
    expect(JSON.parse(afterDeletePayload)).toEqual({ items: [] });
  } finally {
    await deleteTestSession(session);
  }
});

test('conformité visuelle du domaine tuteur @SPEC-2204 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Domaine tutor, conversations et flux SSE en Python',
  );
  await expect(page.getByTestId('spec-2204-scope')).toContainText('Opérations du périmètre');
  await expect(page.getByTestId('spec-2204-scope')).toContainText('12');
  await expect(page.getByTestId('spec-2204-scope')).toContainText('Servies par Python');
  await expect(page.getByTestId('spec-2204-scope')).toContainText('Encore relayées à Hono');
  await expect(page.getByTestId('spec-2204-operations').locator('li')).toHaveCount(12);
  await expect(page.getByTestId('spec-2204-operations')).toContainText('conversations.messages');
  await expect(page.getByTestId('spec-2204-operations')).toContainText('me.ai.credentials.qualify');
  await expect(page.getByTestId('spec-2204-context')).toContainText('4 000 tokens');
  await expect(page.getByTestId('spec-2204-context')).toContainText('Sources citées');
  await expect(page.getByTestId('spec-2204-stream-events').locator('li')).toHaveCount(7);
  await expect(page.getByTestId('spec-2204-stream-events')).toContainText('text-delta');
  await expect(page.getByTestId('spec-2204-stream-events')).toContainText('data-follow-ups');
  await expect(page.getByTestId('spec-2204-stream-latency')).toContainText('50,0 ms');
  await expect(page.getByTestId('spec-2204-stream-latency')).toContainText('500 ms');
  await expect(page.getByTestId('spec-2204-stream')).toContainText(
    'x-vercel-ai-ui-message-stream: v1',
  );
  await expect(page.getByTestId('spec-2204-stream')).toContainText('data: [DONE]');
  await expect(page.getByTestId('spec-2204-providers').locator('li')).toHaveCount(6);
  await expect(page.getByTestId('spec-2204-providers')).toContainText('openai_compatible');
  await expect(page.getByTestId('spec-2204-byok')).toContainText('AES-256-GCM');
  await expect(page.getByTestId('spec-2204-byok')).toContainText('keyMasked');
  await expect(page.getByTestId('spec-2204-byok')).toContainText('STRUCTURED_UNRELIABLE');
  await expect(page.getByTestId('spec-2204-guarantees')).toContainText('Parité contractuelle');
  await expect(page.getByTestId('spec-2204-guarantees')).toContainText('2 scénarios');
  await expect(page.getByTestId('spec-2204-guarantees')).toContainText('RLS');
  await axeCheck();
  await captureEvidence('spec-2204-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-2204-mobile');
});
