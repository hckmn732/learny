// Integration tests of the notion-graph read model (SPEC-616 §12, CA-1 to CA-4).
//
// Postgres is real: RLS hides another learner's formation, personal links and another member's
// contributions never reach the DTO, the mastery status drives the three colours, and the open gap
// list is ordered by ascending mastery.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { notionGraphParams } from '@learny/contracts';
import type { Clock } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { createGroup, createNotionState, createResource } from '@learny/testing';

import { createServiceContext } from '../../src/context';
import { getNotionGraph } from '../../src/notion-graph';

const PREFIX = 'sdd-616-';
const NOW = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(NOW);
  }
}

interface Seed {
  ownerId: string;
  memberId: string;
  strangerId: string;
  formationId: string;
  moduleIds: string[];
  chapterIds: string[];
  notionIds: string[];
}

async function cleanup(): Promise<void> {
  const scope = sql`(select id from auth.users where email like ${`${PREFIX}%@test.learny.test`})`;
  await serviceDb().execute(
    sql`update public.formations set group_id = null where owner_id in ${scope}`,
  );
  await serviceDb().execute(sql`delete from public.groups where owner_id in ${scope}`);
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
}

async function createUser(label: string): Promise<string> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => (await createTestUser(tx, { email })).id);
}

afterEach(cleanup);
afterAll(cleanup);

async function seed(): Promise<Seed> {
  const ownerId = await createUser('owner');
  const memberId = await createUser('member');
  const strangerId = await createUser('stranger');

  const seedData = await serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, ownerId, {
      modules: 3,
      chaptersPerModule: 1,
      notionsPerChapter: 3,
      title: 'SAP S/4HANA Finance',
    });
    await createGroup(tx, { formationId: programme.formationId, ownerId, memberIds: [memberId] });
    const [n0, n1, n2] = programme.notionIds;
    const [module0] = programme.moduleIds;
    const [chapter0] = programme.chapterIds;
    if (n0 === undefined || n1 === undefined || n2 === undefined) {
      throw new Error('notions absentes');
    }
    if (module0 === undefined || chapter0 === undefined) throw new Error('programme absent');

    await tx.execute(sql`
      update public.notions
      set label = case id
        when ${n0}::uuid then 'Société'
        when ${n1}::uuid then 'Variante d’exercice'
        else 'Devise de la société'
      end
      where id in (${n0}::uuid, ${n1}::uuid, ${n2}::uuid)
    `);
    await createNotionState(tx, { userId: ownerId, notionId: n0, mastery: 90, inReview: true });
    await createNotionState(tx, {
      userId: ownerId,
      notionId: n1,
      mastery: 60,
      gapNature: 'forgetting',
      evidence: 'réussie le 6 nov., ratée au quiz global du 10 nov.',
      inReview: true,
    });
    await tx.execute(sql`
      insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind, owner_id, rationale)
      values
        (${programme.formationId}::uuid, ${n0}::uuid, ${n1}::uuid, 'prerequisite', null, 'Prérequis du programme'),
        (${programme.formationId}::uuid, least(${n1}::uuid, ${n2}::uuid), greatest(${n1}::uuid, ${n2}::uuid), 'confusion', ${ownerId}::uuid, 'Confusion relevée en quiz'),
        (${programme.formationId}::uuid, ${n0}::uuid, ${n2}::uuid, 'tutor', ${ownerId}::uuid, 'Lien repéré par le tuteur'),
        (${programme.formationId}::uuid, ${n2}::uuid, ${n0}::uuid, 'tutor', ${memberId}::uuid, 'Lien privé du membre')
    `);
    await createResource(tx, {
      ownerId,
      formationId: programme.formationId,
      chapterId: chapter0,
      title: 'Guide FI (PDF)',
      kind: 'pdf',
    });
    await createResource(tx, {
      ownerId: memberId,
      formationId: programme.formationId,
      chapterId: chapter0,
      title: 'Notes privées du membre',
    });
    await tx.execute(sql`
      insert into public.resources (owner_id, formation_id, chapter_id, kind, title, status, deleted_at)
      values (${ownerId}::uuid, ${programme.formationId}::uuid, ${chapter0}::uuid, 'note', 'Apport supprimé', 'ready', now())
    `);
    const course = await createTestCourse(tx, {
      ownerId,
      moduleId: module0,
      sectionsPerChapter: 1,
    });
    const section = course.sectionIds[0];
    if (section === undefined) throw new Error('section absente');
    await tx.execute(sql`
      update public.course_sections
      set anchor = 'societe', notion_ids = array[${n0}]::uuid[]
      where id = ${section}::uuid
    `);
    return {
      formationId: programme.formationId,
      moduleIds: programme.moduleIds,
      chapterIds: programme.chapterIds,
      notionIds: programme.notionIds,
    };
  });

  return { ownerId, memberId, strangerId, ...seedData };
}

function notionId(data: Seed, index: number): string {
  const value = data.notionIds[index];
  if (value === undefined) throw new Error(`notion ${String(index)} absente`);
  return value;
}

function context(userId: string) {
  return createServiceContext({ userId, requestId: randomUUID(), clock: new TestClock() });
}

describe('[SPEC-616] graphe des notions sous RLS', () => {
  it('renvoie les nœuds, les liens typés et la maîtrise du propriétaire (EF-1, ET-3)', async () => {
    const data = await seed();
    const result = await getNotionGraph(context(data.ownerId), { formationId: data.formationId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const graph = result.value;
    expect(graph.formationTitle).toBe('SAP S/4HANA Finance');
    expect(graph.generatedAt).toBe('2026-11-11T12:20:00.000Z');
    expect(graph.stats.modules).toBe(3);
    expect(graph.stats.notions).toBe(9);
    expect(graph.stats.links).toBe(3);
    expect(graph.stats.openGaps).toBe(1);
    expect(graph.stats.upcoming).toBe(7);
    expect(graph.gaps[0]?.label).toBe('Variante d’exercice');

    const kinds = new Set(graph.links.map((link) => link.kind));
    for (const kind of ['formation', 'contains', 'prerequisite', 'confusion', 'tutor', 'source']) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
    const notion = graph.nodes.find((node) => node.id === `notion:${notionId(data, 1)}`);
    expect(notion?.masteryStatus).toBe('to_consolidate');
    expect(notion?.mastery).toBe(60);
    expect(notion?.gapNature).toBe('forgetting');
    expect(notion?.gapHref).toContain('/lacunes?nature=forgetting');
    const upcoming = graph.nodes.find((node) => node.id === `notion:${notionId(data, 2)}`);
    expect(upcoming?.masteryStatus).toBe('upcoming');
    const source = graph.nodes.find((node) => node.kind === 'source');
    expect(source?.label).toBe('Guide FI (PDF)');
    expect(graph.nodes.some((node) => node.label === 'Apport supprimé')).toBe(false);
    expect(graph.nodes.some((node) => node.label === 'Notes privées du membre')).toBe(false);
    const course = graph.nodes.find((node) => node.id === `notion:${notionId(data, 0)}`);
    expect(course?.courseHref).toContain('/cours?chapitre=');
    expect(course?.courseHref).toContain('#societe');
  });

  it('ne montre ni apport ni lien privé d’un autre membre (CA-4, CL-5)', async () => {
    const data = await seed();
    const result = await getNotionGraph(context(data.memberId), { formationId: data.formationId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const graph = result.value;
    expect(graph.nodes.filter((node) => node.kind === 'source').map((node) => node.label)).toEqual([
      'Notes privées du membre',
    ]);
    expect(graph.stats.notions).toBe(9);
    expect(graph.stats.links).toBe(2);
    expect(graph.links.some((link) => link.kind === 'tutor')).toBe(true);
    expect(graph.links.some((link) => link.kind === 'confusion')).toBe(false);
    expect(graph.links.some((link) => link.kind === 'prerequisite')).toBe(true);
  });

  it('renvoie 404 pour la formation d’un autre apprenant (CA-4)', async () => {
    const data = await seed();
    const result = await getNotionGraph(context(data.strangerId), {
      formationId: data.formationId,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('renvoie 400 pour un identifiant mal formé sans calcul (CA-4)', () => {
    expect(notionGraphParams.safeParse({ fid: 'pas-un-uuid' }).success).toBe(false);
    expect(notionGraphParams.safeParse({ fid: dataUuid() }).success).toBe(true);
  });

  it('gère une formation sans notion avec le seul nœud formation (CL-3)', async () => {
    const ownerId = await createUser('empty');
    const formation = await serviceDb().transaction(async (tx) =>
      tx.execute<{ id: string }>(sql`
        insert into public.formations (owner_id, title, objectives, status)
        values (${ownerId}::uuid, 'Formation vide', '{operational}', 'active')
        returning id::text as id
      `),
    );
    const formationId = formation[0]?.id;
    if (formationId === undefined) throw new Error('formation absente');
    const result = await getNotionGraph(context(ownerId), { formationId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toHaveLength(1);
    expect(result.value.nodes[0]?.kind).toBe('formation');
    expect(result.value.stats.notions).toBe(0);
    expect(result.value.gaps).toEqual([]);
  });
});

function dataUuid(): string {
  return '11111111-1111-4111-8111-111111111111';
}
