// Unit tests of the SPEC-204 e-mail demonstration (ENABLE_SDD_PAGES only): preview, send and the
// memory outbox. The notifications package is a fake; nothing is rendered or delivered for real.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';

import { silentLogger, TestClock } from '../../test/support/fakes';

import { listDemoOutbox, previewEmail, sendDemoEmail } from './dev';

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  fixture: vi.fn(),
  transport: vi.fn(),
  outbox: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@learny/db', () => ({ serviceDb: () => ({}) }));
vi.mock('@learny/notifications/email', () => ({
  EMAIL_TEMPLATES: { welcome: { category: 'transactional' } },
  fixtureFor: mocks.fixture,
  getTransport: mocks.transport,
  listOutbox: mocks.outbox,
  renderEmail: mocks.render,
  sendEmail: mocks.send,
}));

const clock = new TestClock();
const ctx = () => ({
  userId: null as string | null,
  requestId: 'req-1',
  db: null,
  clock,
  logger: silentLogger(),
});

beforeEach(() => {
  mocks.render.mockReset().mockResolvedValue({
    subject: 'Bienvenue',
    html: '<p>Bonjour</p>',
    text: 'Bonjour',
    headers: { 'X-Learny-Template': 'welcome' },
  });
  mocks.fixture.mockReset().mockReturnValue({ firstName: 'Ada' });
  mocks.transport.mockReset().mockReturnValue({ name: 'memory' });
  mocks.outbox.mockReset().mockReturnValue([
    {
      message: {
        to: 'ada@test.learny.test',
        subject: 'Bienvenue',
        headers: { 'X-Learny-Template': 'welcome' },
        tags: [{ name: 'template', value: 'welcome' }],
      },
      at: '2026-11-11T12:20:00.000Z',
    },
    {
      message: {
        to: 'other@test.learny.test',
        subject: 'Sans tag',
        headers: {},
        tags: [],
      },
      at: '2026-11-11T12:21:00.000Z',
    },
  ]);
  mocks.send.mockReset();
});

describe('[SPEC-204] démonstration e-mail', () => {
  it('prévisualise un gabarit avec sa catégorie et un utilisateur de démonstration (EF-2)', async () => {
    const preview = await previewEmail(ctx(), { template: 'welcome', tone: 'tu' });
    expect(preview).toEqual({
      template: 'welcome',
      tone: 'tu',
      category: 'transactional',
      subject: 'Bienvenue',
      html: '<p>Bonjour</p>',
      text: 'Bonjour',
      headers: { 'X-Learny-Template': 'welcome' },
    });
    expect(mocks.render).toHaveBeenCalledWith(
      'welcome',
      { firstName: 'Ada' },
      {
        tone: 'tu',
        userId: '00000000-0000-4000-8000-000000000204',
      },
    );
  });

  it('utilise l’identifiant du lecteur connecté pour la prévisualisation', async () => {
    const signedIn = { ...ctx(), userId: '11111111-1111-4111-8111-111111111111' };
    await previewEmail(signedIn, { template: 'welcome', tone: 'vous' });
    expect(mocks.render).toHaveBeenCalledWith(
      'welcome',
      { firstName: 'Ada' },
      { tone: 'vous', userId: signedIn.userId },
    );
  });

  it('envoie la démonstration au lecteur connecté, avec le transport réel', async () => {
    const signedIn = { ...ctx(), userId: '11111111-1111-4111-8111-111111111111' };
    mocks.send.mockResolvedValue({ ok: true, value: { messageId: 'msg-1' } });
    await expect(sendDemoEmail(signedIn, { template: 'welcome', tone: 'tu' })).resolves.toEqual({
      ok: true,
      value: { messageId: 'msg-1', transport: 'memory' },
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ clock, logger: signedIn.logger }),
      expect.objectContaining({
        userId: signedIn.userId,
        template: 'welcome',
        props: { firstName: 'Ada' },
        toneOverride: 'tu',
        idempotencyKey: expect.stringMatching(/^sdd-204:welcome:/) as unknown as string,
      }),
    );
  });

  it('refuse l’envoi sans lecteur connecté', async () => {
    await expect(sendDemoEmail(ctx(), { template: 'welcome', tone: 'tu' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('renvoie l’échec du service de notification tel quel', async () => {
    const failure = new AppError('SERVICE_UNAVAILABLE', 'indisponible');
    mocks.send.mockResolvedValue({ ok: false, error: failure });
    const result = await sendDemoEmail(
      { ...ctx(), userId: 'u1' },
      { template: 'welcome', tone: 'tu' },
    );
    expect(result).toEqual({ ok: false, error: failure });
  });

  it('ne présente une boîte mémoire que si le transport est mémoire (EF-8)', () => {
    expect(listDemoOutbox()).toEqual({
      items: [
        {
          to: 'ada@test.learny.test',
          subject: 'Bienvenue',
          headers: { 'X-Learny-Template': 'welcome' },
          template: 'welcome',
          at: '2026-11-11T12:20:00.000Z',
        },
        {
          to: 'other@test.learny.test',
          subject: 'Sans tag',
          headers: {},
          template: '',
          at: '2026-11-11T12:21:00.000Z',
        },
      ],
    });
    mocks.transport.mockReturnValue({ name: 'smtp' });
    expect(listDemoOutbox()).toEqual({ items: [] });
  });
});
