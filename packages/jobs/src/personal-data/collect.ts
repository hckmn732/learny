// Collection of one learner's data under Row Level Security (SPEC-211 EF-3, ET-3).
//
// Every read runs through `userDb`: the policies of the `authenticated` role decide what enters
// the archive, so a shared formation contributes its programme and the learner's own course but
// never another member's apports, results or settings. The returned model is JSON-serialisable; a
// storage path is carried as is and read only later, in the zip step.
import { sql } from 'drizzle-orm';

import { formatUserDate } from '@learny/core';
import { userDb } from '@learny/db';

import {
  buildArchiveEntries,
  buildSettingsJson,
  formatLongDate,
  type ArchiveEntry,
  type ArchiveFormation,
  type ArchiveModel,
} from './zip-layout';

type Row = Record<string, unknown>;

export interface ExportCollection {
  timezone: string;
  readme: string;
  settings: Record<string, unknown>;
  results: Record<string, unknown>;
  conversations: Record<string, unknown>;
  programme: Record<string, unknown>[];
  formations: ArchiveFormation[];
}

export interface CollectedExport {
  collection: ExportCollection;
  entries: ArchiveEntry[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function iso(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Converts every Date of a row to an ISO string so the value can cross a step boundary. */
function plain(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}

function programmeOf(
  formation: Row,
  modules: Row[],
  chapters: Row[],
  notions: Row[],
  links: Row[],
): Record<string, unknown> {
  return {
    formation: plain(formation),
    modules: modules.map((module) => ({
      ...plain(module),
      chapters: chapters
        .filter((chapter) => chapter.module_id === module.id)
        .map((chapter) => ({
          ...plain(chapter),
          notions: notions.filter((notion) => notion.chapter_id === chapter.id).map(plain),
        })),
    })),
    links: links.map(plain),
  };
}

function citationsBySection(rows: Row[]): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const key = text(row.section_id);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function courseMarkdown(module: Row, sections: Row[], citations: Map<string, Row[]>): string {
  const lines: string[] = [`# ${text(module.title)}`, ''];
  for (const section of sections) {
    lines.push(`## ${text(section.title) || 'Section'}`, '');
    if (text(section.content_md) !== '') lines.push(text(section.content_md), '');
    for (const citation of citations.get(text(section.id)) ?? []) {
      const label = text(citation.label) || 'source supprimée';
      const quote = text(citation.quote);
      lines.push(quote === '' ? `> Source : ${label}` : `> ${label} — « ${quote} »`, '');
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

function buildReadme(input: {
  now: Date;
  timezone: string;
  email: string;
  formations: number;
}): string {
  return [
    'Export des données personnelles Learny',
    '',
    `Demandé le : ${formatLongDate(input.now, input.timezone)} (${input.timezone})`,
    `Compte : ${input.email}`,
    `Formations : ${String(input.formations)}`,
    '',
    'Contenu :',
    '- README.txt : ce fichier',
    '- settings.json : profil, rythme, notifications et automatismes',
    '- results.json : tentatives, réponses, maîtrise, lacunes, série et activité quotidienne',
    '- conversations.json : historique des discussions avec le tuteur',
    '- formations/<formation>/<module>/cours.md : cours en Markdown par module',
    '- apports/<formation>/<module>/<nom d’origine> : apports originaux',
    '',
    'Aucune clé d’IA ni aucun secret ne figure dans cet export.',
    `Date de référence : ${formatUserDate(input.now, input.timezone)}`,
    `Expiration du fichier : 7 jours après sa création (${new Date(
      input.now.getTime() + 7 * DAY_MS,
    ).toISOString()})`,
    '',
  ].join('\n');
}

/** Reads and lays out one learner's export (EF-3, ET-3). */
export async function collectExportData(userId: string, now: Date): Promise<CollectedExport> {
  return userDb({ userId }).run(async (tx) => {
    const [profile] = await tx.execute<Row>(sql`
      select id::text as id, email, first_name, last_name, course_language::text as course_language,
             tutor_tone::text as tutor_tone, timezone, onboarding_step::text as onboarding_step,
             onboarding_completed_at, terms_version, terms_accepted_at, created_at
      from public.profiles where id = ${userId}::uuid
    `);
    if (profile === undefined) throw new Error('profil absent');
    const timezone = text(profile.timezone) || 'Europe/Paris';

    const [study] = await tx.execute<Row>(sql`
      select hours_per_day, study_days, preferred_slots from public.study_preferences
      where user_id = ${userId}::uuid
    `);
    const [notifications] = await tx.execute<Row>(sql`
      select channel_email, channel_push, type_revision, type_validation, type_course, type_gap,
             type_planning, type_relaunch, quiet_start, quiet_end, weekend_quiet, max_per_day
      from public.notification_settings where user_id = ${userId}::uuid
    `);
    const automations = await tx.execute<Row>(sql`
      select key::text as key, enabled, params, updated_at from public.automation_settings
      where user_id = ${userId}::uuid order by key
    `);

    const formations = await tx.execute<Row>(sql`
      select id::text as id, group_id::text as group_id, title, description,
             objectives::text[] as objectives, status::text as status, exam_format,
             maintenance_mode::text as maintenance_mode, start_date, end_date,
             default_threshold, completed_at, created_at
      from public.formations order by created_at, id
    `);
    const modules = await tx.execute<Row>(sql`
      select id::text as id, formation_id::text as formation_id, position, title, objectives,
             status::text as status, threshold, opened_at, validated_at
      from public.modules order by formation_id, position
    `);
    const chapters = await tx.execute<Row>(sql`
      select id::text as id, module_id::text as module_id, formation_id::text as formation_id,
             position, title
      from public.chapters order by module_id, position
    `);
    const notions = await tx.execute<Row>(sql`
      select id::text as id, formation_id::text as formation_id, module_id::text as module_id,
             chapter_id::text as chapter_id, label, short_definition, position
      from public.notions order by formation_id, position
    `);
    const links = await tx.execute<Row>(sql`
      select id::text as id, formation_id::text as formation_id, from_notion_id::text as from_notion_id,
             to_notion_id::text as to_notion_id, kind::text as kind, rationale
      from public.notion_links order by formation_id, id
    `);

    const courses = await tx.execute<Row>(sql`
      select id::text as id, formation_id::text as formation_id, module_id::text as module_id,
             version, status::text as status, created_at
      from public.courses where is_current order by module_id
    `);
    const sections = await tx.execute<Row>(sql`
      select s.id::text as id, s.course_id::text as course_id, s.chapter_id::text as chapter_id,
             s.position, s.kind::text as kind, s.title, s.content_md, s.origin::text as origin
      from public.course_sections s
      join public.courses c on c.id = s.course_id
      where c.is_current and not s.reported
      order by c.module_id, s.chapter_id, s.position
    `);
    const citations = await tx.execute<Row>(sql`
      select id::text as id, section_id::text as section_id, resource_id::text as resource_id,
             quote, label, media_kind::text as media_kind
      from public.citations order by section_id, created_at
    `);

    const resources = await tx.execute<Row>(sql`
      select id::text as id, formation_id::text as formation_id, chapter_id::text as chapter_id,
             kind::text as kind, title, storage_path, mime, size_bytes, url, content_text,
             metadata, created_at
      from public.resources where deleted_at is null order by created_at, id
    `);

    const attempts = await tx.execute<Row>(sql`
      select id::text as id, activity_id::text as activity_id, attempt_no, started_at, submitted_at,
             duration_ms, score, passed, per_notion, hints_used, created_at
      from public.attempts order by created_at, id
    `);
    const answers = await tx.execute<Row>(sql`
      select a.id::text as id, a.attempt_id::text as attempt_id,
             a.brick_version_id::text as brick_version_id, a.position, a.response, a.is_correct,
             a.score, a.max_score, a.time_ms, a.feedback, a.answered_at
      from public.answers a join public.attempts t on t.id = a.attempt_id
      order by a.attempt_id, a.position
    `);
    const states = await tx.execute<Row>(sql`
      select notion_id::text as notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
             success_count, gap_confused_with::text as gap_confused_with, gap_detected_at,
             gap_evidence, gap_cleared_at, suspended, in_review, revision
      from public.notion_states order by notion_id
    `);
    const gaps = await tx.execute<Row>(sql`
      select id::text as id, notion_id::text as notion_id, kind::text as kind,
             nature::text as nature, evidence, created_at
      from public.gap_events order by created_at, id
    `);
    const days = await tx.execute<Row>(sql`
      select day, minutes, qualifying, sources from public.daily_activity order by day
    `);
    const milestones = await tx.execute<Row>(sql`
      select id::text as id, formation_id::text as formation_id, key::text as key, ref_id::text as ref_id,
             achieved_at
      from public.milestones order by achieved_at, id
    `);
    const conversations = await tx.execute<Row>(sql`
      select id::text as id, course_id::text as course_id, title, created_at, updated_at
      from public.tutor_conversations order by created_at, id
    `);
    const messages = await tx.execute<Row>(sql`
      select m.id::text as id, m.conversation_id::text as conversation_id, m.role::text as role,
             m.content, m.sources, m.follow_ups, m.self_test, m.created_at
      from public.tutor_messages m
      join public.tutor_conversations c on c.id = m.conversation_id
      order by m.conversation_id, m.created_at, m.id
    `);

    const citationMap = citationsBySection(citations);
    const formationIds = formations.map((formation) => text(formation.id));
    const modulesOf = (formationId: string): Row[] =>
      modules.filter((module) => module.formation_id === formationId);
    const modulesWithCourse = new Map<string, Row[]>();
    for (const section of sections) {
      const moduleId = text(courses.find((course) => course.id === section.course_id)?.module_id);
      if (moduleId === '') continue;
      const list = modulesWithCourse.get(moduleId) ?? [];
      list.push(section);
      modulesWithCourse.set(moduleId, list);
    }

    const chapterModule = new Map<string, string>();
    for (const chapter of chapters) {
      chapterModule.set(text(chapter.id), text(chapter.module_id));
    }

    const archiveFormations: ArchiveFormation[] = [];
    const programme: Record<string, unknown>[] = [];
    for (const formation of formations) {
      const formationId = text(formation.id);
      const formationModules = modulesOf(formationId);
      programme.push(
        programmeOf(
          formation,
          formationModules,
          chapters.filter((chapter) => chapter.formation_id === formationId),
          notions.filter((notion) => notion.formation_id === formationId),
          links.filter((link) => link.formation_id === formationId),
        ),
      );

      const archiveModules = formationModules.map((module) => {
        const moduleSections = modulesWithCourse.get(text(module.id)) ?? [];
        const markdown =
          moduleSections.length === 0 ? null : courseMarkdown(module, moduleSections, citationMap);
        const apports = resources
          .filter((resource) => {
            if (resource.formation_id !== formationId) return false;
            const moduleId =
              resource.chapter_id === null
                ? ''
                : (chapterModule.get(text(resource.chapter_id)) ?? '');
            return moduleId === '' ? formationModules[0]?.id === module.id : moduleId === module.id;
          })
          .map((resource) => {
            const storage = text(resource.storage_path);
            const title = text(resource.title) || 'apport';
            const base = storage === '' ? `${title}.txt` : (storage.split('/').pop() ?? title);
            const inline =
              storage === ''
                ? text(resource.content_text) !== ''
                  ? text(resource.content_text)
                  : text(resource.url)
                : null;
            return {
              name: base,
              storagePath: storage === '' ? null : storage,
              text: inline,
            };
          });
        return {
          position: Number(module.position),
          title: text(module.title),
          courseMarkdown: markdown,
          apports,
        };
      });
      // Apports without a chapter were attached to the first module above; a formation with no
      // module still exports its apports under a synthetic module.
      if (archiveModules.length === 0 && resources.some((r) => r.formation_id === formationId)) {
        archiveModules.push({
          position: 1,
          title: 'Apports',
          courseMarkdown: null,
          apports: resources
            .filter((resource) => resource.formation_id === formationId)
            .map((resource) => {
              const storage = text(resource.storage_path);
              return {
                name:
                  storage === ''
                    ? `${text(resource.title) || 'apport'}.txt`
                    : (storage.split('/').pop() ?? 'apport'),
                storagePath: storage === '' ? null : storage,
                text: storage === '' ? text(resource.content_text) || text(resource.url) : null,
              };
            }),
        });
      }
      archiveFormations.push({
        title: text(formation.title) || 'Formation',
        programme: programme[programme.length - 1],
        modules: archiveModules,
      });
    }

    const settings = buildSettingsJson({
      profile: {
        ...plain(profile),
        exportCount: formationIds.length,
      },
      studyPreferences: study === undefined ? null : plain(study),
      notificationSettings: notifications === undefined ? null : plain(notifications),
      automations: automations.map(plain),
    });
    const results = {
      attempts: attempts.map((attempt) => ({
        ...plain(attempt),
        answers: answers.filter((answer) => answer.attempt_id === attempt.id).map(plain),
      })),
      notionStates: states.map(plain),
      gaps: gaps.map(plain),
      dailyActivity: days.map(plain),
      milestones: milestones.map(plain),
    };
    const conversationJson = conversations.map((conversation) => ({
      ...plain(conversation),
      messages: messages
        .filter((message) => message.conversation_id === conversation.id)
        .map((message) => ({ ...plain(message), at: iso(message.created_at) })),
    }));
    const model: ArchiveModel = {
      readme: buildReadme({
        now,
        timezone,
        email: text(profile.email),
        formations: formations.length,
      }),
      settings,
      results,
      conversations: { conversations: conversationJson },
      formations: archiveFormations,
    };

    return {
      collection: {
        timezone,
        readme: model.readme,
        settings: model.settings as Record<string, unknown>,
        results,
        conversations: { conversations: conversationJson },
        programme,
        formations: archiveFormations,
      },
      entries: buildArchiveEntries(model),
    };
  });
}
