// Parité des identifiants et des opérations avec le web (SPEC-4003 ET-4, CA-5).
//
// The list is the one of SPEC-4002 ET-3, in its order. The dynamic rows repeat `{i}`: the screens
// render `simple-file-0`, `simple-role-0`, etc. The operations are the eight routes of SPEC-4001
// plus the three operations the same course calls (programme validation, deadline, quiz submission
// of the diagnostic). The parity test compares this list with the contract registry itself.
export const SIMPLE_TEST_IDS = [
  'simple-card-drop',
  'simple-card-tutor',
  'simple-dropzone',
  'simple-file-{i}',
  'simple-role-{i}',
  'simple-link',
  'simple-motivation',
  'simple-create',
  'simple-key-warning',
  'simple-steps',
  'simple-chapters-found',
  'simple-kpis',
  'simple-modules',
  'simple-deadline',
  'simple-start',
  'simple-adjust',
  'diagnostic-progress',
  'diagnostic-skip',
  'simple-ready-card',
  'simple-generation',
] as const;

/** Operations of the parity contract (CA-5), in call order of the nominal course. */
export const SIMPLE_OPERATIONS = [
  'formations.simple.create',
  'sources.uploads.create',
  'resources.finalize',
  'sources.links.create',
  'resources.role',
  'formations.simple.analysis',
  'formations.simple.get',
  'programme.validate',
  'formations.update',
  'diagnostic.create',
  'quiz.answers.save',
  'quiz.attempts.submit',
  'quiz.attempts.result',
  'diagnostic.skip',
] as const;

/** Concrete identifiers of a list with `{i}` placeholders for the first `count` rows. */
export function expandTestIds(count = 3): string[] {
  return SIMPLE_TEST_IDS.flatMap((id) =>
    id.includes('{i}')
      ? Array.from({ length: count }, (_, index) => id.replace('{i}', String(index)))
      : [id],
  );
}
