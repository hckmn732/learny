// Shared fixtures of the programme unit tests (SPEC-605). Everything is in memory: no database,
// no network, no clock from the machine (ADR-0047).
import { vi } from 'vitest';

import { type ProgrammeDraft } from '@learny/contracts';
import type { UserDatabase } from '@learny/db';

import type { ServiceContext } from '../../src/context';
import { normalizeDraft } from '../../src/programme/rules';
import type { FormationRow, ProposalRow } from '../../src/programme/state';

import { silentLogger, TestClock } from './fakes';

export const USER = '11111111-1111-4111-8111-111111111111';
export const FORMATION = '22222222-2222-4222-8222-222222222222';
export const PROPOSAL = '33333333-3333-4333-8333-333333333333';
export const CHANGE_REQUEST = '44444444-4444-4444-8444-444444444444';
export const IMPORT = '55555555-5555-4555-8555-555555555555';
export const MODULE_1 = '66666666-6666-4666-8666-666666666666';
export const MODULE_2 = '77777777-7777-4777-8777-777777777777';
export const CHAPTER_1 = '88888888-8888-4888-8888-888888888888';
export const CHAPTER_2 = '99999999-9999-4999-8999-999999999999';
export const NOW = new Date('2026-11-11T12:20:00Z');

const notion = { label: 'Notion A', definition: 'Définition courte A.' };

/** A valid tutor draft with two modules, one chapter and one notion each. */
export function programmeDraft(overrides: Partial<ProgrammeDraft> = {}): ProgrammeDraft {
  return {
    description: 'Formation de test.',
    volumeHours: 20,
    summary: 'Deux modules.',
    modules: [
      {
        title: 'Module 1',
        objectives: ['Objectif 1'],
        plannedStart: '2026-11-02',
        plannedEnd: '2026-11-06',
        threshold: 80,
        chapters: [{ title: 'Chapitre 1', notions: [notion] }],
      },
      {
        title: 'Module 2',
        objectives: ['Objectif 2'],
        plannedStart: '2026-11-09',
        plannedEnd: '2026-11-13',
        threshold: 75,
        chapters: [{ title: 'Chapitre 2', notions: [notion] }],
      },
    ],
    ...overrides,
  };
}

/** The numbered payload stored in `programme_proposals.payload`. */
export function programmePayload() {
  return normalizeDraft(programmeDraft());
}

export function formationRow(overrides: Partial<FormationRow> = {}): FormationRow {
  return {
    id: FORMATION,
    title: 'SAP S/4HANA Finance',
    description: null,
    status: 'cadrage',
    objectives: ['operational'],
    cadrage_profile: {
      scope: { value: 'SAP', state: 'done' },
      dates: { value: null, state: 'todo' },
    },
    volume_hours: 20,
    start_date: '2026-11-02',
    end_date: '2026-11-13',
    default_threshold: 80,
    course_language: 'fr',
    ...overrides,
  };
}

export function proposalRow(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: PROPOSAL,
    version: 1,
    source: 'generated',
    description: null,
    volume_hours: null,
    summary: null,
    payload: programmePayload(),
    created_at: NOW.toISOString(),
    import_id: null,
    change_request_id: null,
    ...overrides,
  };
}

export function profileRow(overrides: Record<string, unknown> = {}) {
  return { tutor_tone: 'tu', course_language: 'fr', timezone: 'Europe/Paris', ...overrides };
}

export function sequence(rows: readonly unknown[][]): ReturnType<typeof vi.fn> {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

export function context(
  execute: ReturnType<typeof vi.fn>,
  userId: string | null = USER,
): ServiceContext {
  return {
    userId,
    requestId: 'req-programme-unit',
    db:
      userId === null
        ? null
        : ({
            run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }),
          } as unknown as UserDatabase),
    clock: new TestClock(NOW.toISOString()),
    logger: silentLogger(),
  };
}
