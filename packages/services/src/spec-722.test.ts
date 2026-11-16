import { describe, expect, it } from 'vitest';

import type { AutomationActionItem, TutorActivityItem } from '@learny/contracts';
import { AppError, err, ok } from '@learny/core';

import {
  buildTutorActivityFeed,
  canUndoTutorActivity,
  createTutorActivityService,
  decodeTutorActivityCursor,
  encodeTutorActivityCursor,
  paginateTutorActivity,
  readTutorActivity,
  tutorActivityDateLabel,
  tutorActivityHref,
  TUTOR_ACTIVITY_CARD_LIMIT,
  TUTOR_SETTINGS_HREF,
} from './accueil-le-tuteur-a-agi-pour-vous';
import type { ServiceContext } from './context';

const FORMATION = '11111111-1111-4111-8111-111111111111';
const ACTION = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const AT = '2026-11-11T07:05:00.000Z';

function action(overrides: Partial<AutomationActionItem> = {}): AutomationActionItem {
  return {
    id: ACTION,
    automation: 'remediation',
    kind: 'remediation_ready',
    summary: 'Marge de remédiation réservée mercredi de 15:00 à 16:00.',
    formationId: FORMATION,
    payload: {},
    undoPayload: null,
    requiresConsent: false,
    status: 'applied',
    decidedAt: AT,
    createdAt: AT,
    ...overrides,
  };
}

function item(overrides: Partial<TutorActivityItem> = {}): TutorActivityItem {
  return {
    id: ACTION,
    automation: 'remediation',
    type: 'remediation_ready',
    summary: 'Marge de remédiation réservée mercredi de 15:00 à 16:00.',
    status: 'applied',
    requiresConsent: false,
    createdAt: AT,
    decidedAt: AT,
    href: `/formations/${FORMATION}/programme`,
    canUndo: true,
    ...overrides,
  };
}

describe('[SPEC-722] règles et calculs', () => {
  it('CA-1 — une action en attente entre dans le bandeau puis dans la carte une fois acceptée', () => {
    const pending = action({
      automation: 'reprise',
      kind: 'reprise_proposed',
      status: 'pending_consent',
      requiresConsent: true,
      decidedAt: null,
      payload: {
        proposed: { startsAt: '2026-11-12T09:30:00.000Z' },
        chosenStartsAt: null,
      },
    });

    // ADR-0191 §1 — la proposition `reprise` appartient au bandeau, pas à la carte.
    const bannerOnly = buildTutorActivityFeed({ pending: [pending] });
    expect(bannerOnly.proposals).toHaveLength(0);
    expect(bannerOnly.items).toHaveLength(0);

    // ADR-0191 §1 — une proposition d'un autre automatisme reste dans la carte avec « Confirmer ».
    const cardProposal = { ...pending, automation: 'questions_cartes' as const };
    const before = buildTutorActivityFeed({ pending: [cardProposal] });
    expect(before.proposals).toHaveLength(1);
    expect(before.proposals[0]?.status).toBe('pending_consent');
    expect(before.items).toHaveLength(0);

    const applied = { ...pending, status: 'applied' as const, decidedAt: AT };
    const after = buildTutorActivityFeed({ pending: [applied], applied: [applied] });
    expect(after.proposals).toHaveLength(0);
    expect(after.items).toHaveLength(1);
    expect(after.items[0]?.summary).toBe(pending.summary);
    expect(after.items[0]?.canUndo).toBe(true);
  });

  it('CA-2 — une action consommée garde son résumé et n’offre plus « Annuler »', () => {
    const consumed = action({ status: 'consumed', summary: 'Micro-séance faite.' });
    const feed = buildTutorActivityFeed({ consumed: [consumed] });
    expect(feed.items[0]?.summary).toBe('Micro-séance faite.');
    expect(feed.items[0]?.canUndo).toBe(false);
    expect(canUndoTutorActivity('consumed')).toBe(false);
    expect(canUndoTutorActivity('applied')).toBe(true);

    const reprise = action({
      automation: 'reprise',
      status: 'consumed',
      payload: { chosenStartsAt: '2026-11-12T09:30:00.000Z' },
    });
    expect(tutorActivityHref(reprise, 'Europe/Paris')).toBe('/agenda?vue=semaine&date=2026-11-12');
    expect(TUTOR_SETTINGS_HREF).toBe('/parametres#automatismes');
  });

  it('EF-2, CL-5 — une cible supprimée ne produit aucun lien cassé', () => {
    const deleted = action({ formationId: null });
    expect(tutorActivityHref(deleted)).toBeNull();
    expect(buildTutorActivityFeed({ applied: [deleted] }).items[0]?.href).toBeNull();
    expect(
      tutorActivityHref(
        action({
          automation: 'reprise',
          payload: { proposed: { startsAt: '2026-11-12T10:00:00Z' } },
        }),
        'Europe/Paris',
      ),
    ).toBe('/agenda?vue=semaine&date=2026-11-12');
    expect(tutorActivityHref(action({ automation: 'sprint' }))).toBe('/agenda');
    expect(tutorActivityHref(action({ automation: 'bilan' }))).toBe(
      `/formations/${FORMATION}/bilan`,
    );
  });

  it('EF-2 — les actions récentes sont triées par date décroissante puis par identifiant', () => {
    const older = action({ id: '44444444-4444-4444-8444-444444444444', createdAt: AT });
    const sameDate = action({ id: OTHER, createdAt: AT });
    const newer = action({ id: ACTION, createdAt: '2026-11-11T08:00:00.000Z' });
    const feed = buildTutorActivityFeed({ applied: [older, sameDate, newer] });
    expect(feed.items.map((entry) => entry.id)).toEqual([ACTION, older.id, OTHER]);
    expect(feed.items).toHaveLength(3);
  });

  it('EF-3 — la limite de la carte et les entrées vides restent déterministes', () => {
    const many = Array.from({ length: TUTOR_ACTIVITY_CARD_LIMIT + 2 }, (_, index) =>
      action({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        createdAt: `2026-11-${String(11 - index).padStart(2, '0')}T08:00:00.000Z`,
      }),
    );
    const feed = buildTutorActivityFeed({ applied: many });
    expect(feed.items).toHaveLength(TUTOR_ACTIVITY_CARD_LIMIT);
    expect(buildTutorActivityFeed()).toEqual({
      proposals: [],
      items: [],
      weekCount: 0,
      nextCursor: null,
    });
  });

  it('ET-3 — la pagination stable reprend après le dernier élément du curseur', () => {
    const first = item({ id: ACTION, createdAt: '2026-11-11T08:00:00.000Z' });
    const second = item({ id: OTHER, createdAt: '2026-11-10T08:00:00.000Z' });
    const third = item({
      id: '44444444-4444-4444-8444-444444444444',
      createdAt: '2026-11-09T08:00:00.000Z',
    });
    const page = paginateTutorActivity([first, second, third], { limit: 2 });
    expect(page.items.map((entry) => entry.id)).toEqual([ACTION, OTHER]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeTutorActivityCursor(encodeTutorActivityCursor(second))).toEqual({
      createdAt: second.createdAt,
      id: second.id,
    });
    const next = paginateTutorActivity([first, second, third], {
      limit: 2,
      cursor: page.nextCursor,
    });
    expect(next.items.map((entry) => entry.id)).toEqual([third.id]);
    expect(next.nextCursor).toBeNull();
    expect(paginateTutorActivity([first], { cursor: 'bogus' }).items).toHaveLength(1);
  });

  it('EF-2 — les libellés de date suivent le fuseau du profil', () => {
    expect(tutorActivityDateLabel('2026-11-11T07:05:00.000Z', 'Europe/Paris')).toBe(
      '11 nov. 08:05',
    );
    expect(tutorActivityDateLabel('2026-11-11T23:30:00.000Z', 'Europe/Paris')).toBe(
      '12 nov. 00:30',
    );
    expect(tutorActivityDateLabel('2026-11-11T12:20:00.000Z', 'UTC')).toBe('11 nov. 12:20');
  });

  it('ET-1 — la façade lit les trois filtres et délègue les décisions à SPEC-711', async () => {
    const calls: string[] = [];
    const context = {} as ServiceContext;
    const ports = {
      list: (
        _ctx: ServiceContext,
        query: { status: 'pending_consent' | 'applied' | 'consumed'; limit: number },
      ) => {
        calls.push(query.status);
        return Promise.resolve(
          ok({
            items: query.status === 'applied' ? [action()] : [],
            weekCount: query.status === 'applied' ? 3 : 0,
            nextCursor: null,
          }),
        );
      },
      accept: () => Promise.resolve(ok(action({ status: 'applied' }))),
      decline: () => Promise.resolve(ok(action({ status: 'declined' }))),
      undo: () => Promise.resolve(ok(action({ status: 'undone' }))),
    };

    const service = createTutorActivityService(ports);
    const result = await service.read(context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.weekCount).toBe(3);
    }
    expect(calls.sort()).toEqual(['applied', 'consumed', 'pending_consent']);

    const accepted = await service.accept(context, { actionId: ACTION });
    expect(accepted.ok && accepted.value.status).toBe('applied');
    const declined = await service.decline(context, { actionId: ACTION });
    expect(declined.ok && declined.value.status).toBe('declined');
    const undone = await service.undo(context, { actionId: ACTION });
    expect(undone.ok && undone.value.status).toBe('undone');
  });

  it('ET-1 — une erreur du journal RLS est propagée sans écrire de carte partielle', async () => {
    const failure = err(new AppError('NOT_FOUND', 'Journal introuvable.'));
    const ports = {
      list: () => Promise.resolve(failure),
      accept: () => Promise.resolve(failure),
      decline: () => Promise.resolve(failure),
      undo: () => Promise.resolve(failure),
    };
    const result = await readTutorActivity({} as ServiceContext, ports);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});
