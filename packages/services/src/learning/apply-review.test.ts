// Unit tests of the single review application (SPEC-701 ET-3, ET-4; BR-MEM-02). The transaction is a
// fake: no SQL and no FSRS persistence are executed. These tests pin the format gate, the absent
// state, the input validation and the applied outcome the answer route returns.
import { describe, expect, it } from 'vitest';

import type { DbTx } from '@learny/db';

import { sqlText } from '../../test/support/fakes';

import { applyReviewResult, type ApplyReviewResultInput } from './apply-review';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOTION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ANSWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ATTEMPT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LOG = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const INPUT: ApplyReviewResultInput = {
  userId: USER,
  notionId: NOTION,
  source: 'global_quiz',
  format: 'recall_card',
  correct: true,
  rating: 'good',
  timeMs: 4200,
  answerId: ANSWER,
  attemptId: ATTEMPT,
  attemptNo: 1,
  reviewedAt: '2026-11-11T12:20:00.000Z',
};

function fakeTx(options: { state?: Record<string, unknown> | null } = {}): DbTx {
  const state =
    options.state === undefined
      ? {
          notion_id: NOTION,
          fsrs: {
            due: '2026-11-10T08:00:00.000Z',
            stability: 3.2,
            difficulty: 5.1,
            elapsed_days: 2,
            scheduled_days: 3,
            reps: 2,
            lapses: 0,
            state: 2,
            last_review: '2026-11-07T08:00:00.000Z',
          },
          due_at: '2026-11-10T08:00:00Z',
          mastery: '0.6',
          first_seen_at: '2026-11-01T08:00:00Z',
          last_seen_at: '2026-11-07T08:00:00Z',
          success_count: 2,
          gap_nature: null,
          gap_confused_with: null,
          gap_detected_at: null,
          gap_evidence: null,
          gap_cleared_at: null,
          in_review: true,
        }
      : options.state;
  const tx = {
    execute: (query: unknown): Promise<unknown[]> => {
      const text = sqlText(query);
      if (text.includes('from public.notion_states') && text.includes('for update')) {
        return Promise.resolve(state === null ? [] : [state]);
      }
      if (text.includes('and b.notion_ids @>')) return Promise.resolve([]);
      if (text.includes('a.time_ms is not null')) return Promise.resolve([]);
      if (text.startsWith('insert into public.notion_states')) return Promise.resolve([]);
      if (text.includes('public.append_review_log')) return Promise.resolve([{ id: LOG }]);
      if (text.includes('public.append_gap_event')) return Promise.resolve([]);
      return Promise.resolve([]);
    },
  };
  return tx as unknown as DbTx;
}

describe('[SPEC-701] application d’une revue', () => {
  it('ET-3 — un format hors moteur ne écrit rien et rend null', async () => {
    await expect(applyReviewResult(fakeTx(), { ...INPUT, format: 'text' })).resolves.toBeNull();
  });

  it('ET-3 — une notion sans état est ignorée, jamais inventée', async () => {
    await expect(applyReviewResult(fakeTx({ state: null }), INPUT)).resolves.toBeNull();
  });

  it('CL-1 — une entrée hors schéma est refusée avant toute lecture', async () => {
    await expect(
      applyReviewResult(fakeTx(), { ...INPUT, notionId: 'pas-un-uuid' }),
    ).rejects.toThrow(/uuid/i);
    await expect(applyReviewResult(fakeTx(), { ...INPUT, timeMs: -1 })).rejects.toThrow();
  });

  it('ET-4 — une carte de rappel met à jour la carte FSRS et rend la prochaine échéance', async () => {
    const applied = await applyReviewResult(fakeTx(), INPUT);
    expect(applied).not.toBeNull();
    expect(applied).toMatchObject({ rating: 'good' });
    expect(applied?.dueAt).toMatch(/^2026-11-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u);
    expect(applied?.cardAfter.state).toBeDefined();
  });

  it('ET-4 — une réponse fausse est notée « again » sans auto-évaluation', async () => {
    const applied = await applyReviewResult(fakeTx(), {
      ...INPUT,
      format: 'matching',
      correct: false,
      rating: null,
    });
    expect(applied).toMatchObject({ rating: 'again' });
  });
});
