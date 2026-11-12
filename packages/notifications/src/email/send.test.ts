// Sending and headers of the e-mail service (SPEC-204 §12): category-dependent headers, profile
// reading (address and tone), validation, missing profile, transactional override and memory
// deduplication.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LearnyLogger } from '@learny/core';
import type { Db } from '@learny/db';

import { fixtureFor } from '../../emails/fixtures';
import type { EmailProps, EmailTemplateKey } from '../../emails/schemas';
import type { Tone } from '../../emails/tone';

import { disableEmailChannel, sendEmail, type EmailContext } from './send';
import { setTransport } from './transports';
import { clearOutbox, listOutbox, memoryTransport } from './transports/memory';

const USER_ID = '3f9a2f0e-1c4b-4c5d-8e9f-0a1b2c3d4e5f';
const EMAIL = 'alex.perrin@test.learny.test';
const logger = { info: vi.fn() } as unknown as LearnyLogger;

/** Owner-role client answering exactly the queries of `sendEmail` and `canSendServiceEmail`. */
function dbWith(rows: {
  profile?: { email: string; tutorTone: string };
  settings?: unknown[];
}): Db {
  return {
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve(
              'email' in fields
                ? rows.profile === undefined
                  ? []
                  : [rows.profile]
                : (rows.settings ?? []),
            ),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([{ userId: USER_ID }]) }),
      }),
    }),
  } as unknown as Db;
}

function context(db: Db): EmailContext {
  return { sdb: db, clock: { now: () => new Date('2026-11-11T12:20:00Z') }, logger };
}

const send = <K extends EmailTemplateKey>(
  db: Db,
  template: K,
  props?: EmailProps<K>,
  extra: { idempotencyKey?: string; toOverride?: string; toneOverride?: Tone } = {},
) =>
  sendEmail(context(db), {
    userId: USER_ID,
    template,
    props: props ?? (fixtureFor(template, 'vous') as EmailProps<K>),
    idempotencyKey: extra.idempotencyKey ?? `${template}:${USER_ID}`,
    ...(extra.toOverride === undefined ? {} : { toOverride: extra.toOverride }),
    ...(extra.toneOverride === undefined ? {} : { toneOverride: extra.toneOverride }),
  });

beforeEach(() => {
  setTransport(memoryTransport);
  clearOutbox();
});

afterEach(() => {
  setTransport(undefined);
  clearOutbox();
  vi.restoreAllMocks();
});

describe('[SPEC-204] envoi', () => {
  it('EF-1 — l’adresse et le ton viennent du profil, l’expéditeur de la configuration', async () => {
    const result = await send(dbWith({ profile: { email: EMAIL, tutorTone: 'tu' } }), 'welcome');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.category).toBe('service');

    const [entry] = listOutbox();
    expect(entry?.message.to).toBe(EMAIL);
    expect(entry?.message.from).toContain('@');
    expect(entry?.message.text).toContain('Ton compte est prêt');
    expect(entry?.message.text).not.toMatch(/\b(vous|votre|vos)\b/i);
    expect(entry?.message.headers['X-Entity-Ref-ID']).toBe(`welcome:${USER_ID}`);
  });

  it('CA-2 — en-têtes de désinscription sur service, aucun sur transactionnel', async () => {
    await send(dbWith({ profile: { email: EMAIL, tutorTone: 'vous' } }), 'daily_digest');
    await send(dbWith({ profile: { email: EMAIL, tutorTone: 'vous' } }), 'export_ready');
    const [service, transactional] = listOutbox();
    expect(service?.message.headers['List-Unsubscribe']).toMatch(
      /\/api\/v1\/email\/unsubscribe\?token=/,
    );
    expect(service?.message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(transactional?.message.headers['List-Unsubscribe']).toBeUndefined();
    expect(transactional?.message.headers['List-Unsubscribe-Post']).toBeUndefined();
    expect(transactional?.message.tags).toContainEqual({
      name: 'category',
      value: 'transactional',
    });
  });

  it('CL-1 — le rejeu du même idempotencyKey ne crée pas de second message', async () => {
    const db = dbWith({ profile: { email: EMAIL, tutorTone: 'vous' } });
    const first = await send(db, 'weekly_review', undefined, { idempotencyKey: 'same-key' });
    const second = await send(db, 'weekly_review', undefined, { idempotencyKey: 'same-key' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.messageId).toBe(first.value.messageId);
    expect(listOutbox()).toHaveLength(1);
  });

  it('EF-1 — profil introuvable : NOT_FOUND, sauf avec toOverride', async () => {
    const missing = await send(dbWith({}), 'export_ready');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('NOT_FOUND');
    expect(listOutbox()).toHaveLength(0);

    const result = await send(dbWith({}), 'deletion_completed', undefined, {
      toOverride: 'captured@test.learny.test',
    });
    expect(result.ok).toBe(true);
    expect(listOutbox()[0]?.message.to).toBe('captured@test.learny.test');
  });

  it('CL-2 — des props invalides sont refusées avant tout envoi', async () => {
    const result = await send(
      dbWith({ profile: { email: EMAIL, tutorTone: 'vous' } }),
      'reminder',
      {
        title: 'x'.repeat(121),
        body: 'corps',
        href: '/accueil',
        formationTitle: null,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED');
    expect(listOutbox()).toHaveLength(0);
  });

  it('toneOverride impose le ton demandé par l’appelant', async () => {
    await send(
      dbWith({ profile: { email: EMAIL, tutorTone: 'vous' } }),
      'export_ready',
      undefined,
      {
        toneOverride: 'tu',
      },
    );
    expect(listOutbox()[0]?.message.text).toContain('Ton archive (42 Mo) est prête');
    expect(listOutbox()[0]?.message.text).not.toMatch(/\b(vous|votre|vos)\b/i);
  });

  it('le journal ne porte jamais l’adresse du destinataire', async () => {
    const logged = vi.fn();
    const db = dbWith({ profile: { email: EMAIL, tutorTone: 'vous' } });
    await sendEmail(
      {
        sdb: db,
        clock: { now: () => new Date('2026-11-11T12:20:00Z') },
        logger: { info: logged } as unknown as LearnyLogger,
      },
      {
        userId: USER_ID,
        template: 'welcome',
        props: { firstName: 'Alex' },
        idempotencyKey: 'log-check',
      },
    );
    const serialized = JSON.stringify(logged.mock.calls);
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).toContain(USER_ID);
    expect(serialized).toContain('welcome');
  });

  it('disableEmailChannel coupe le canal e-mail de l’utilisateur', async () => {
    const updated = await disableEmailChannel(
      {
        sdb: dbWith({}),
        clock: { now: () => new Date('2026-11-11T12:20:00Z') },
        logger,
      },
      USER_ID,
    );
    expect(updated).toBe(true);
  });
});
