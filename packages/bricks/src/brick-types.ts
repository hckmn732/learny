// The thirteen brick types (BR-BRI-01). A new type requires code in this list, a schema, checks,
// a public projection, examples and a registry entry: that is exactly the "un nouveau type demande
// du code" rule.
export const BRICK_TYPES = [
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
] as const;

export type BrickType = (typeof BRICK_TYPES)[number];

/** BR-BRI-09 — why the tutor assembled the brick. */
export const BRICK_PURPOSES = [
  'course',
  'validation',
  'bank',
  'remediation',
  'exercise',
  'exam',
  'warmup',
  'review',
] as const;

export type BrickPurpose = (typeof BRICK_PURPOSES)[number];

/** BR-BRI-04 — a content brick comes from a resource excerpt or from the tutor knowledge. */
export const BRICK_ORIGINS = ['resource', 'tutor'] as const;

export type BrickOrigin = (typeof BRICK_ORIGINS)[number];
