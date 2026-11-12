// Unit tests of the brick/activity/attempt schema and JSON shapes (SPEC-106 §12, CA-1 to CA-3).
// They are pure: no database connection. Column names and enumeration values are checked against
// docs/architecture/data-model.md §5, and the JSON boundaries of the repositories are exercised.
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_KINDS,
  ACTIVITY_STATUSES,
  ATTEMPT_STATUSES,
  BRICK_PURPOSES,
  BRICK_STATUSES,
  BRICK_TYPES,
  GRADERS,
  REPORT_STATUSES,
  activities,
  answers,
  attempts,
  brickReports,
  brickVersions,
  bricks,
} from './bricks-activities';
import {
  activityConfigSchema,
  activityItemsErrors,
  activityItemSchema,
  answerFeedbackSchema,
  answerResponseSchema,
  attemptPerNotionSchema,
  brickFingerprintSchema,
  brickReportResolutionSchema,
  durationMsSchema,
  positiveVersionSchema,
  scoreSchema,
} from './bricks-json';

const BRICK_ID = '6f1d0f2a-0000-4000-8000-000000000001';
const VERSION_ID = '6f1d0f2a-0000-4000-8000-000000000002';
const NOTION_ID = '6f1d0f2a-0000-4000-8000-000000000003';
const FINGERPRINT = 'a'.repeat(64);

function columns(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();
}

describe('[SPEC-106] brick schema', () => {
  it('CA-1 — expose les huit énumérations de data-model §5', () => {
    expect(BRICK_TYPES).toEqual([
      'text',
      'resource_excerpt',
      'choice_question',
      'open_question',
      'cloze',
      'matching',
      'ordering',
      'categorization',
      'recall_card',
      'instruction',
      'scripted_dialogue',
      'timer',
      'scoring',
    ]);
    expect(BRICK_PURPOSES).toEqual([
      'course',
      'validation',
      'bank',
      'remediation',
      'exercise',
      'exam',
      'warmup',
      'review',
    ]);
    expect(BRICK_STATUSES).toEqual(['active', 'reported', 'retired']);
    expect(ACTIVITY_KINDS).toEqual([
      'course',
      'validation_quiz',
      'global_quiz_session',
      'remediation',
      'exercise',
      'mock_exam',
      'warmup',
      'micro_session',
      'sprint',
      'self_test',
      'scripted_dialogue',
      'project_step',
    ]);
    expect(ACTIVITY_STATUSES).toEqual(['draft', 'ready', 'archived']);
    expect(ATTEMPT_STATUSES).toEqual([
      'in_progress',
      'submitted',
      'graded',
      'timed_out',
      'abandoned',
    ]);
    expect(GRADERS).toEqual(['code', 'tutor']);
    expect(REPORT_STATUSES).toEqual(['open', 'corrected', 'dismissed']);
  });

  it('CA-1 — les six tables portent les noms de colonnes du modèle de données', () => {
    expect(columns(bricks)).toEqual(
      [
        'created_at',
        'current_version',
        'formation_id',
        'id',
        'notion_ids',
        'owner_id',
        'purpose',
        'status',
        'type',
      ].sort(),
    );
    expect(columns(brickVersions)).toEqual(
      [
        'brick_id',
        'created_at',
        'created_by',
        'fingerprint',
        'id',
        'origin',
        'payload',
        'version',
      ].sort(),
    );
    expect(columns(brickReports)).toEqual(
      [
        'brick_id',
        'brick_version_id',
        'created_at',
        'id',
        'reason',
        'resolution',
        'resolved_at',
        'status',
        'user_id',
      ].sort(),
    );
    expect(columns(activities)).toEqual(
      [
        'config',
        'created_at',
        'for_date',
        'formation_id',
        'id',
        'items',
        'kind',
        'module_id',
        'owner_id',
        'status',
      ].sort(),
    );
    expect(columns(attempts)).toEqual(
      [
        'activity_id',
        'attempt_no',
        'created_at',
        'deadline_at',
        'duration_ms',
        'hints_used',
        'id',
        'passed',
        'per_notion',
        'review_feedback',
        'score',
        'started_at',
        'status',
        'submitted_at',
        'user_id',
      ].sort(),
    );
    expect(columns(answers)).toEqual(
      [
        'answered_at',
        'attempt_id',
        'brick_version_id',
        'chosen_distractor_notion_id',
        'feedback',
        'graded_by',
        'id',
        'is_correct',
        'marked_for_review',
        'max_score',
        'position',
        'response',
        'score',
        'time_ms',
      ].sort(),
    );
  });

  it('CA-1 — valide la liste ordonnée des items et son caractère non vide pour une activité prête', () => {
    const items = [
      { brickId: BRICK_ID, brickVersionId: VERSION_ID },
      { brickId: BRICK_ID, brickVersionId: VERSION_ID, points: 2.5 },
    ];
    expect(activityItemsErrors(items)).toEqual([]);
    expect(activityItemsErrors([], { ready: true })).not.toEqual([]);
    expect(activityItemsErrors([])).toEqual([]);
    expect(activityItemsErrors([{ brickId: BRICK_ID }])).not.toEqual([]);
    expect(
      activityItemsErrors([{ brickId: 'pas-un-uuid', brickVersionId: VERSION_ID }]),
    ).not.toEqual([]);
    expect(
      activityItemsErrors([{ brickId: BRICK_ID, brickVersionId: VERSION_ID, points: 101 }]),
    ).not.toEqual([]);
    expect(
      activityItemsErrors([{ brickId: BRICK_ID, brickVersionId: VERSION_ID, inconnu: true }]),
    ).not.toEqual([]);
    expect(
      activityItemSchema.safeParse({ brickId: BRICK_ID, brickVersionId: VERSION_ID, points: 0 })
        .success,
    ).toBe(true);
  });

  it('CA-3 — borne les scores, durées, versions et empreintes', () => {
    expect(scoreSchema.safeParse(0).success).toBe(true);
    expect(scoreSchema.safeParse(100).success).toBe(true);
    expect(scoreSchema.safeParse(-1).success).toBe(false);
    expect(scoreSchema.safeParse(100.01).success).toBe(false);
    expect(durationMsSchema.safeParse(0).success).toBe(true);
    expect(durationMsSchema.safeParse(-1).success).toBe(false);
    expect(durationMsSchema.safeParse(12.5).success).toBe(false);
    expect(positiveVersionSchema.safeParse(1).success).toBe(true);
    expect(positiveVersionSchema.safeParse(0).success).toBe(false);
    expect(brickFingerprintSchema.safeParse(FINGERPRINT).success).toBe(true);
    expect(brickFingerprintSchema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(brickFingerprintSchema.safeParse('a'.repeat(63)).success).toBe(false);
  });

  it('CA-3 — valide le détail par notion et les scores cohérents', () => {
    expect(
      attemptPerNotionSchema.safeParse({
        [NOTION_ID]: { correct: 2, total: 3, score: 66.67 },
      }).success,
    ).toBe(true);
    expect(
      attemptPerNotionSchema.safeParse({
        [NOTION_ID]: { correct: 4, total: 3, score: 66.67 },
      }).success,
    ).toBe(false);
    expect(
      attemptPerNotionSchema.safeParse({
        [NOTION_ID]: { correct: 1, total: 1, score: 101 },
      }).success,
    ).toBe(false);
    expect(
      attemptPerNotionSchema.safeParse({ 'pas-un-uuid': { correct: 1, total: 1, score: 100 } })
        .success,
    ).toBe(false);
  });

  it('EF-3 — valide la configuration minimale sans perdre les clés futures', () => {
    expect(
      activityConfigSchema.safeParse({
        threshold: 80,
        durationSec: 1800,
        questionCount: 10,
        hintsMax: 3,
        diagnosticModuleIds: [NOTION_ID],
        futureKey: 'conservé',
      }).success,
    ).toBe(true);
    const parsed = activityConfigSchema.parse({ threshold: 90, futureKey: 'conservé' });
    expect(parsed.futureKey).toBe('conservé');
    expect(activityConfigSchema.safeParse({ threshold: 101 }).success).toBe(false);
    expect(activityConfigSchema.safeParse({ durationSec: 0 }).success).toBe(false);
    expect(activityConfigSchema.safeParse({ questionCount: -1 }).success).toBe(false);
  });

  it('EF-5 — accepte une réponse objet ou tableau et un retour structuré', () => {
    expect(answerResponseSchema.safeParse({ choice: 'b' }).success).toBe(true);
    expect(answerResponseSchema.safeParse([BRICK_ID, VERSION_ID]).success).toBe(true);
    expect(answerResponseSchema.safeParse('texte libre').success).toBe(false);
    expect(
      answerFeedbackSchema.safeParse({
        explanation: 'La clé 401 est un compte fournisseur.',
        criteria: [{ key: 'sens', ok: true, comment: 'Correct' }],
        missing: [],
      }).success,
    ).toBe(true);
    expect(answerFeedbackSchema.safeParse({ criteria: [{ key: '', ok: true }] }).success).toBe(
      false,
    );
  });

  it('EF-2 — valide la résolution d’un signalement', () => {
    expect(brickReportResolutionSchema.safeParse({ action: 'dismissed' }).success).toBe(true);
    expect(
      brickReportResolutionSchema.safeParse({ action: 'corrected', newVersionId: VERSION_ID })
        .success,
    ).toBe(true);
    expect(brickReportResolutionSchema.safeParse({ action: 'autre' }).success).toBe(false);
  });
});
