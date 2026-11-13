// Inventaire RLS de Learny (SPEC-113 EF-6, EF-7 ; ADR-0022, ADR-0035, ADR-0248).
//
// The matrix is the single source of truth of the isolation harness: every table of the `public`
// schema is classified and declares the operations allowed to its owner, to a member of the group
// sharing the programme, and to a non-member. The integration suite compares this inventory with
// `pg_catalog`; a table created later without an entry fails the suite (CL-6).

export type RlsCategory = 'shared-programme' | 'personal' | 'service';

/** How the integration suite proves the entry. */
export type RlsScenario = 'personal-row' | 'shared-programme' | 'service-table';

export type RlsOperation = 'select' | 'insert' | 'update' | 'delete';

/** Expected outcome of one operation for one of the three probe identities. */
export type RlsExpectation = Readonly<Record<RlsOperation, boolean>>;

export interface RlsTableMatrix {
  table: string;
  category: RlsCategory;
  scenario: RlsScenario;
  /** Column used by the generic isolation probes (`id`, `user_id`, `owner_id`, `formation_id`). */
  probeColumn: 'id' | 'user_id' | 'owner_id' | 'formation_id';
  /** Policy names asserted present in `pg_policies`, in the migration. */
  policies: readonly string[];
  owner: RlsExpectation;
  member: RlsExpectation;
  /** An authenticated user outside the group, with no relation to the row. */
  nonMember: RlsExpectation;
  /** Required when a table intentionally exposes no policy to authenticated users. */
  justification?: string;
}

const DENY: RlsExpectation = { select: false, insert: false, update: false, delete: false };
const READ_ONLY: RlsExpectation = { select: true, insert: false, update: false, delete: false };
const ALL: RlsExpectation = { select: true, insert: true, update: true, delete: true };
const APPEND_ONLY: RlsExpectation = { select: true, insert: true, update: false, delete: false };
const READ_DECIDE: RlsExpectation = { select: true, insert: false, update: true, delete: false };
const READ_UPDATE: RlsExpectation = { select: true, insert: false, update: true, delete: false };

/** Personal row whose write is reserved to the service (journal, generated artifact, projection). */
function personal(
  table: string,
  probeColumn: RlsTableMatrix['probeColumn'],
  policies: readonly string[],
  owner: RlsExpectation = ALL,
): RlsTableMatrix {
  return {
    table,
    category: 'personal',
    scenario: 'personal-row',
    probeColumn,
    policies,
    owner,
    member: DENY,
    nonMember: DENY,
  };
}

function shared(
  table: string,
  probeColumn: RlsTableMatrix['probeColumn'],
  policies: readonly string[],
  owner: RlsExpectation = ALL,
): RlsTableMatrix {
  return {
    table,
    category: 'shared-programme',
    scenario: 'shared-programme',
    probeColumn,
    policies,
    owner,
    member: READ_ONLY,
    nonMember: DENY,
  };
}

function service(table: string, justification: string): RlsTableMatrix {
  return {
    table,
    category: 'service',
    scenario: 'service-table',
    probeColumn: 'id',
    policies: [],
    owner: DENY,
    member: DENY,
    nonMember: DENY,
    justification,
  };
}

export const RLS_MATRIX: readonly RlsTableMatrix[] = [
  // Identité et préférences (SPEC-102).
  personal('profiles', 'id', ['profiles_owner_select', 'profiles_owner_update'], READ_UPDATE),
  personal('study_preferences', 'user_id', ['study_preferences_owner_all']),
  personal('notification_settings', 'user_id', ['notification_settings_owner_all']),
  personal('push_subscriptions', 'id', ['push_subscriptions_owner_all']),
  personal('automation_settings', 'user_id', ['automation_settings_owner_all']),
  personal('pauses', 'id', ['pauses_owner_all']),

  // Programme partagé (SPEC-103, SPEC-111).
  shared('formations', 'id', [
    'formations_owner_select',
    'formations_member_select',
    'formations_owner_insert',
    'formations_owner_update',
    'formations_owner_delete',
  ]),
  shared('modules', 'id', ['modules_owner_all', 'modules_member_select']),
  shared('chapters', 'id', ['chapters_owner_all', 'chapters_member_select']),
  shared('notions', 'id', ['notions_owner_all', 'notions_member_select']),
  shared('notion_links', 'id', [
    'notion_links_owner_all',
    'notion_links_programme_select',
    'notion_links_programme_owner_insert',
    'notion_links_programme_owner_update',
    'notion_links_programme_owner_delete',
  ]),
  shared('groups', 'id', [
    'groups_member_select',
    'groups_owner_insert',
    'groups_owner_update',
    'groups_owner_delete',
  ]),
  shared('group_members', 'user_id', [
    'group_members_member_select',
    'group_members_owner_insert',
    'group_members_owner_update',
    'group_members_owner_delete',
  ]),

  // Données de cadrage et de programme personnelles au propriétaire de la formation.
  personal('cadrage_messages', 'id', ['cadrage_messages_owner_all']),
  personal('programme_imports', 'id', ['programme_imports_owner_all']),
  personal('programme_proposals', 'id', ['programme_proposals_owner_all']),
  personal('programme_change_requests', 'id', ['programme_change_requests_owner_all']),
  personal('chapter_progress', 'user_id', ['chapter_progress_owner_all']),
  personal('module_progress', 'user_id', ['module_progress_owner_all']),

  // Ressources et passages (SPEC-104).
  personal('resources', 'id', ['resources_owner_all']),
  personal('resource_chunks', 'id', ['resource_chunks_owner_select'], READ_ONLY),

  // Cours et discussions (SPEC-105).
  personal('courses', 'id', ['courses_owner_all']),
  personal('course_sections', 'id', ['course_sections_owner_all']),
  personal('course_section_revisions', 'id', ['course_section_revisions_owner_select'], READ_ONLY),
  personal('citations', 'id', ['citations_owner_all']),
  personal('reading_progress', 'user_id', ['reading_progress_owner_all']),
  personal('chapter_summaries', 'id', ['chapter_summaries_owner_all']),
  personal('tutor_conversations', 'id', ['tutor_conversations_owner_all']),
  personal('tutor_messages', 'id', ['tutor_messages_owner_all']),

  // Briques, activités et tentatives (SPEC-106).
  personal('bricks', 'id', ['bricks_owner_all']),
  personal('brick_versions', 'id', ['brick_versions_owner_all']),
  personal('brick_reports', 'id', ['brick_reports_owner_all']),
  // SPEC-513 — the job state is written in the learner's RLS transaction by the service; every
  // row stays scoped to its owner and contains no question content.
  personal('question_bank_jobs', 'id', ['question_bank_jobs_owner_all']),
  personal('activities', 'id', ['activities_owner_all']),
  personal('attempts', 'id', ['attempts_owner_all']),
  personal('answers', 'id', ['answers_owner_all']),

  // Mémorisation et lacunes (SPEC-107).
  personal('notion_states', 'user_id', ['notion_states_owner_all']),
  personal('review_logs', 'id', ['review_logs_owner_select'], READ_ONLY),
  personal('gap_events', 'id', ['gap_events_owner_select'], READ_ONLY),

  // Agenda et automatismes (SPEC-108).
  personal('schedule_slots', 'id', ['schedule_slots_owner_all']),
  personal(
    'automation_actions',
    'id',
    ['automation_actions_owner_select', 'automation_actions_owner_update'],
    READ_DECIDE,
  ),
  personal('daily_activity', 'user_id', ['daily_activity_owner_all']),
  personal('milestones', 'id', ['milestones_owner_select'], READ_ONLY),

  // Notifications (SPEC-109).
  personal('notifications', 'id', ['notifications_owner_all']),
  personal('notification_deliveries', 'id', ['notification_deliveries_owner_select'], READ_ONLY),

  // IA et facturation (SPEC-110).
  personal('ai_credentials', 'id', ['ai_credentials_owner_all']),
  personal('ai_task_models', 'user_id', ['ai_task_models_owner_all']),
  personal('ai_calls', 'id', ['ai_calls_owner_select'], READ_ONLY),
  personal('subscriptions', 'user_id', ['subscriptions_owner_select'], READ_ONLY),
  // SPEC-507 — leases of the daily cap written and settled by the AI service only. No
  // `authenticated` policy: a learner reads his spend through `ai_calls` and `/me/ai/usage`.
  service(
    'ai_budget_reservations',
    'Réservations de budget du service IA (SPEC-507 ET-2, CL-5, ADR-0294) ; aucune lecture ni écriture client.',
  ),

  // Données personnelles et recherche (SPEC-112).
  personal('data_exports', 'id', ['data_exports_owner_select'], READ_ONLY),
  personal(
    'legal_acceptances',
    'id',
    ['legal_acceptances_owner_select', 'legal_acceptances_owner_insert'],
    APPEND_ONLY,
  ),

  // Tables de service : aucune politique `authenticated`. Le rôle service contourne RLS.
  service(
    'idempotency_keys',
    'Clés d’idempotence manipulées exclusivement par le wrapper d’API (SPEC-112 EF-3, ADR-0120) ; aucune lecture ni écriture client.',
  ),
  service(
    'rate_limits',
    'Seaux de limitation de débit réservés au service (SPEC-112 EF-4, SPEC-208) ; aucune lecture ni écriture client.',
  ),
  service(
    'event_outbox',
    'Boîte d’envoi des événements de domaine (SPEC-203 ET-2, ADR-0122) : écrite uniquement par la fonction security definer enqueue_event, lue et mise à jour par le service ; aucun accès client.',
  ),
  service(
    'sdd_demo_runs',
    'Exécutions du pipeline de démonstration SDD (SPEC-203 ET-7) : réservées au service, jamais exposées au client.',
  ),
  service(
    'stripe_events',
    'Événements Stripe déjà reçus (SPEC-210 ET-3, ADR-0215) : insérés (on conflict do nothing) et marqués traités par le webhook via serviceDb ; aucun accès client.',
  ),
];

export interface RlsCategoryCount {
  category: RlsCategory;
  count: number;
}

/** Counts displayed by the SDD demonstration and asserted by the unit test. */
export function categoryCounts(matrix: readonly RlsTableMatrix[] = RLS_MATRIX): RlsCategoryCount[] {
  const categories: RlsCategory[] = ['shared-programme', 'personal', 'service'];
  return categories.map((category) => ({
    category,
    count: matrix.filter((entry) => entry.category === category).length,
  }));
}

export interface RlsPolicyViolation {
  line: number;
  statement: string;
}

const PERMISSIVE = /\b(using|with\s+check)\s*\(\s*true\s*\)/i;
const JUSTIFICATION = /--\s*justification\s*:/i;

/**
 * EF-7 / CA-4 — rejects `USING (true)` and `WITH CHECK (true)` unless the statement carries an
 * explicit `-- justification:` comment within the three preceding lines. The CI unit test runs it
 * on every migration; a policy cannot become permissive silently.
 */
export function findUnjustifiedPermissivePolicies(sql: string): RlsPolicyViolation[] {
  const lines = sql.split(/\r?\n/);
  const violations: RlsPolicyViolation[] = [];
  lines.forEach((line, index) => {
    if (!PERMISSIVE.test(line)) return;
    const window = lines.slice(Math.max(0, index - 3), index + 1).join('\n');
    if (JUSTIFICATION.test(window)) return;
    violations.push({ line: index + 1, statement: line.trim() });
  });
  return violations;
}

/** Every policy name declared in the matrix, deduplicated, for the migration audit. */
export function matrixPolicyNames(matrix: readonly RlsTableMatrix[] = RLS_MATRIX): string[] {
  return [...new Set(matrix.flatMap((entry) => entry.policies))].sort();
}
