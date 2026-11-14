import {
  ProgrammeProposalDtoSchema,
  ProgrammeProposalStateDto,
  type ProgrammeFormationStatus,
  type ProgrammeModuleStatus,
  type ProgrammeProposalDto,
  type ProgrammeSource,
  type ProgrammeVersionSummary,
} from '@learny/contracts';
import { AppError } from '@learny/core';
import { serviceDb, sql, type DbTx } from '@learny/db';

import { parseProposalPayload } from './rules';

// Reads and projection of the proposed programme (SPEC-605 ET-1, ET-3). Every query runs in the
// learner's RLS transaction: a formation of another owner is absent, so the route answers 404.
// The `cadrage-completed` outbox row is system metadata and is read with the service client.

export interface FormationRow {
  [key: string]: unknown;
  id: string;
  title: string;
  description: string | null;
  status: ProgrammeFormationStatus;
  objectives: string[];
  cadrage_profile: unknown;
  volume_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  default_threshold: number;
  course_language: string;
}

export interface ProposalRow {
  [key: string]: unknown;
  id: string;
  version: number;
  source: ProgrammeSource;
  description: string | null;
  volume_hours: number | null;
  summary: string | null;
  payload: unknown;
  created_at: string | Date;
  import_id: string | null;
  change_request_id: string | null;
}

interface ModuleRow {
  [key: string]: unknown;
  id: string;
  position: number;
  title: string;
  objectives: string[];
  planned_start: string | null;
  planned_end: string | null;
  threshold: number;
  status: string;
}

interface ChapterRow {
  [key: string]: unknown;
  id: string;
  module_id: string;
  position: number;
  title: string;
}

interface NotionRow {
  [key: string]: unknown;
  id: string;
  chapter_id: string;
  label: string;
  short_definition: string | null;
}

/**
 * Reads a formation with the caller's RLS client. `owner` (default) is the write/administration
 * path; `member` also accepts an active group member for the shared read models (RLS already
 * restricts the row to the owner or a member).
 */
export async function readFormation(
  tx: DbTx,
  userId: string,
  formationId: string,
  access: 'owner' | 'member' = 'owner',
): Promise<FormationRow | null> {
  const ownerFilter = access === 'owner' ? sql`and owner_id = ${userId}::uuid` : sql``;
  const rows = await tx.execute<FormationRow>(sql`
    select id::text as id,
           title,
           description,
           status::text as status,
           objectives::text[] as objectives,
           cadrage_profile,
           volume_hours,
           start_date::text as start_date,
           end_date::text as end_date,
           default_threshold,
           course_language::text as course_language
    from public.formations
    where id = ${formationId}::uuid
      ${ownerFilter}
    limit 1
  `);
  return rows[0] ?? null;
}

export async function readProfile(
  tx: DbTx,
  userId: string,
): Promise<{ tone: 'tu' | 'vous'; courseLanguage: string; timezone: string }> {
  const rows = await tx.execute<{
    tutor_tone: 'tu' | 'vous';
    course_language: string;
    timezone: string;
  }>(sql`
    select tutor_tone::text as tutor_tone, course_language::text as course_language, timezone
    from public.profiles
    where id = ${userId}::uuid
    limit 1
  `);
  const row = rows[0];
  return {
    tone: row?.tutor_tone ?? 'vous',
    courseLanguage: row?.course_language ?? 'fr',
    timezone: row?.timezone ?? 'Europe/Paris',
  };
}

export async function listProposals(tx: DbTx, formationId: string): Promise<ProposalRow[]> {
  return tx.execute<ProposalRow>(sql`
    select id::text as id,
           version,
           source::text as source,
           description,
           volume_hours,
           summary,
           payload,
           created_at,
           import_id::text as import_id,
           change_request_id::text as change_request_id
    from public.programme_proposals
    where formation_id = ${formationId}::uuid
    order by version desc
  `);
}

export async function readProposal(
  tx: DbTx,
  formationId: string,
  version: number,
): Promise<ProposalRow | null> {
  const rows = await tx.execute<ProposalRow>(sql`
    select id::text as id,
           version,
           source::text as source,
           description,
           volume_hours,
           summary,
           payload,
           created_at,
           import_id::text as import_id,
           change_request_id::text as change_request_id
    from public.programme_proposals
    where formation_id = ${formationId}::uuid
      and version = ${version}
    limit 1
  `);
  return rows[0] ?? null;
}

export async function currentVersion(tx: DbTx, formationId: string): Promise<number> {
  const rows = await tx.execute<{ version: number }>(sql`
    select coalesce(max(version), 0) as version
    from public.programme_proposals
    where formation_id = ${formationId}::uuid
  `);
  return rows[0]?.version ?? 0;
}

export async function activeFormationCount(
  tx: DbTx,
  userId: string,
  exceptFormationId: string,
): Promise<number> {
  const rows = await tx.execute<{ count: number }>(sql`
    select count(*)::int as count
    from public.formations
    where owner_id = ${userId}::uuid
      and status = 'active'
      and id <> ${exceptFormationId}::uuid
  `);
  return rows[0]?.count ?? 0;
}

/** EF-4 — the proposal only exists after the cadrage was explicitly completed. */
export async function cadrageCompleted(formationId: string): Promise<boolean> {
  // service-role: outbox metadata is not readable under RLS, and the formation ownership was
  // already checked by `readFormation` in the user transaction (SPEC-605 ET-1).
  const rows = await serviceDb().execute<{ present: boolean }>(sql`
    select true as present
    from public.event_outbox
    where event_id = ${`cadrage-completed:${formationId}`}
    limit 1
  `);
  return rows.length > 0;
}

async function readActiveProgramme(
  tx: DbTx,
  formationId: string,
): Promise<{
  modules: ModuleRow[];
  chapters: ChapterRow[];
  notions: NotionRow[];
}> {
  const modules = await tx.execute<ModuleRow>(sql`
    select id::text as id,
           position,
           title,
           objectives::text[] as objectives,
           planned_start::text as planned_start,
           planned_end::text as planned_end,
           threshold,
           status::text as status
    from public.modules
    where formation_id = ${formationId}::uuid
    order by position asc
  `);
  const chapters = await tx.execute<ChapterRow>(sql`
    select c.id::text as id, c.module_id::text as module_id, c.position, c.title
    from public.chapters c
    join public.modules m on m.id = c.module_id
    where m.formation_id = ${formationId}::uuid
    order by c.position asc
  `);
  const notions = await tx.execute<NotionRow>(sql`
    select n.id::text as id,
           n.chapter_id::text as chapter_id,
           n.label,
           n.short_definition
    from public.notions n
    where n.formation_id = ${formationId}::uuid
    order by n.position asc
  `);
  return { modules, chapters, notions };
}

function versionSummaries(
  proposals: readonly ProposalRow[],
  current: number,
): ProgrammeVersionSummary[] {
  return proposals.map((proposal) => ({
    version: proposal.version,
    source: proposal.source,
    createdAt: new Date(proposal.created_at).toISOString(),
    current: proposal.version === current,
  }));
}

export function buildProposalDto(input: {
  formation: FormationRow;
  proposal: ProposalRow;
  proposals: readonly ProposalRow[];
  activeCount: number;
  active?: { modules: ModuleRow[]; chapters: ChapterRow[]; notions: NotionRow[] };
}): ProgrammeProposalDto {
  const { formation, proposal, proposals, activeCount } = input;
  const payload = parseProposalPayload(proposal.payload);
  const active = input.active;
  const moduleByPosition = new Map(active?.modules.map((row) => [row.position, row]) ?? []);
  const chaptersByModule = new Map<string, ChapterRow[]>();
  for (const chapter of active?.chapters ?? []) {
    const list = chaptersByModule.get(chapter.module_id) ?? [];
    list.push(chapter);
    chaptersByModule.set(chapter.module_id, list);
  }
  const notionsByChapter = new Map<string, NotionRow[]>();
  for (const notion of active?.notions ?? []) {
    const list = notionsByChapter.get(notion.chapter_id) ?? [];
    list.push(notion);
    notionsByChapter.set(notion.chapter_id, list);
  }

  const isActiveStructure =
    active !== undefined &&
    (formation.status === 'active' ||
      formation.status === 'paused' ||
      formation.status === 'completed');

  const modules = payload.modules.map((module) => {
    const row = isActiveStructure ? moduleByPosition.get(module.position) : undefined;
    const chapters = module.chapters.map((chapter) => {
      const chapterRow = row
        ? (chaptersByModule.get(row.id) ?? []).find((entry) => entry.position === chapter.position)
        : undefined;
      const notions = chapterRow === undefined ? chapter.notions : [];
      if (chapterRow !== undefined) {
        for (const notion of notionsByChapter.get(chapterRow.id) ?? []) {
          notions.push({
            label: notion.label,
            definition: notion.short_definition ?? '',
          });
        }
      }
      return {
        position: chapter.position,
        title: chapterRow?.title ?? chapter.title,
        notions: notions.length === 0 ? chapter.notions : notions,
      };
    });
    return {
      position: module.position,
      title: row?.title ?? module.title,
      objectives: row?.objectives ?? module.objectives,
      plannedStart: row?.planned_start ?? module.plannedStart,
      plannedEnd: row?.planned_end ?? module.plannedEnd,
      threshold: row?.threshold ?? module.threshold,
      status: (row?.status as ProgrammeModuleStatus | undefined) ?? null,
      chapters,
    };
  });

  const dto = {
    formationId: formation.id,
    version: proposal.version,
    source: proposal.source,
    proposalStatus: isActiveStructure ? 'active' : 'proposed',
    title: formation.title,
    description: formation.description ?? proposal.description ?? payload.description,
    summary: proposal.summary ?? payload.summary,
    volumeHours: formation.volume_hours ?? proposal.volume_hours ?? payload.volumeHours,
    createdAt: new Date(proposal.created_at).toISOString(),
    modules,
    versions: versionSummaries(proposals, proposals[0]?.version ?? proposal.version),
    activeFormationCount: activeCount,
  };
  return ProgrammeProposalDtoSchema.parse(dto);
}

/** Whole page state for the GET route and every mutation answer. */
export async function readProgrammeState(
  tx: DbTx,
  userId: string,
  formationId: string,
  options: { version?: number | undefined; completed?: boolean } = {},
): Promise<ProgrammeProposalStateDto> {
  const formation = await readFormation(tx, userId, formationId);
  if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
  const proposals = await listProposals(tx, formationId);
  const latest = proposals[0];
  const selected =
    options.version === undefined
      ? latest
      : proposals.find((proposal) => proposal.version === options.version);
  const completed = options.completed ?? (await cadrageCompleted(formationId));
  const activeCount = await activeFormationCount(tx, userId, formationId);

  let proposal: ProgrammeProposalDto | null = null;
  if (selected !== undefined) {
    const active =
      selected.version === latest?.version &&
      (formation.status === 'active' ||
        formation.status === 'paused' ||
        formation.status === 'completed')
        ? await readActiveProgramme(tx, formationId)
        : undefined;
    proposal = buildProposalDto({
      formation,
      proposal: selected,
      proposals,
      activeCount,
      ...(active === undefined ? {} : { active }),
    });
  }

  const state: ProgrammeProposalStateDto = ProgrammeProposalStateDto.parse({
    formationId: formation.id,
    title: formation.title,
    description: formation.description,
    formationStatus: formation.status,
    cadrageCompleted: completed,
    proposal,
  });
  return state;
}
