// Support of the SPEC-807 EF-6 journey (data rights): declared fixtures of the two isolated
// learners, a strict reader of the ZIP produced by the export job, and the nightly deletion run
// with an injected clock (ADR-0047 — the machine clock is never touched).
import { inflateRawSync } from 'node:zlib';

import { createClient } from '@supabase/supabase-js';

import { createAttempt, createNotionState, createResource } from '@learny/testing';
import { serviceDb, sql } from '@learny/testing/db';
import { createTestCourse, createTestProgramme } from '@learny/testing/db';
import { supabaseLocalEnv } from '@learny/testing/supabase';

/** Data seeded for one learner: every marker must (or must not) be found in an archive. */
export interface SeededLearner {
  formationTitle: string;
  formationSlug: string;
  moduleFolder: string;
  courseMarker: string;
  noteTitle: string;
  noteText: string;
  fileName: string;
  filePath: string;
  fileBytes: Buffer;
  attemptScore: number;
  mastery: number;
}

function admin() {
  const { url, serviceRoleKey } = supabaseLocalEnv();
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

/** Lower-case slug, same rule as the archive layout (ADR-0216) for the plain titles used here. */
function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A tiny but well-formed PDF whose text carries the marker of its owner. */
function pdfBytes(marker: string): Buffer {
  return Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj',
      `% ${marker}`,
      'trailer << /Root 1 0 R >>',
      '%%EOF',
      '',
    ].join('\n'),
    'utf8',
  );
}

/**
 * Declared initial fixture (SPEC-807 ET-3): a formation with one open module, its current course,
 * a note and a PDF really stored in the private `resources` bucket, a graded attempt and a notion
 * state. Everything is unique to `tag`, so replays never contaminate each other (ET-2).
 */
export async function seedLearner(
  userId: string,
  options: { label: string; tag: string },
): Promise<SeededLearner> {
  const { label, tag } = options;
  const formationTitle = `${label} ${tag}`;
  const courseMarker = `Cours ${label} ${tag} : le lettrage rapproche débit et crédit.`;
  // ASCII title: the archive keeps it as the note's file name (`<title>.txt`, ADR-0216).
  const noteTitle = `Memo ${slug(label)} ${tag}`;
  const noteText = `Note ${label} ${tag} : pointer les comptes de tiers chaque semaine.`;
  const fileName = `fiche-${slug(label)}-${tag}.pdf`;
  const attemptScore = label === 'Témoin' ? 41 : 82;
  const mastery = label === 'Témoin' ? 23 : 64;

  const seeded = await serviceDb().transaction(async (tx) => {
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', first_name = ${label}
      where id = ${userId}::uuid
    `);
    const programme = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: formationTitle,
    });
    const moduleId = programme.moduleIds[0];
    const chapterId = programme.chapterIds[0];
    const notionId = programme.notionIds[0];
    if (moduleId === undefined || chapterId === undefined || notionId === undefined) {
      throw new Error('programme de fixture incomplet');
    }
    await tx.execute(sql`update public.modules set status = 'open' where id = ${moduleId}::uuid`);
    const course = await createTestCourse(tx, { ownerId: userId, moduleId });
    await tx.execute(sql`
      update public.course_sections set content_md = ${courseMarker}
      where course_id = ${course.courseId}::uuid
    `);
    await createResource(tx, {
      ownerId: userId,
      formationId: programme.formationId,
      chapterId,
      kind: 'note',
      title: noteTitle,
      content: noteText,
    });
    const file = await createResource(tx, {
      ownerId: userId,
      formationId: programme.formationId,
      chapterId,
      kind: 'pdf',
      title: `Fiche ${label}`,
      mime: 'application/pdf',
    });
    const filePath = `${userId}/${file.id}/${fileName}`;
    await tx.execute(sql`
      update public.resources set storage_path = ${filePath} where id = ${file.id}::uuid
    `);
    const [activity] = await tx.execute<{ id: string }>(sql`
      insert into public.activities (owner_id, formation_id, module_id, kind, status, items)
      values (
        ${userId}::uuid, ${programme.formationId}::uuid, ${moduleId}::uuid,
        'validation_quiz', 'draft', '[]'::jsonb
      )
      returning id::text as id
    `);
    if (activity === undefined) throw new Error('activité de fixture non créée');
    await createAttempt(tx, {
      userId,
      activityId: activity.id,
      score: attemptScore,
      passed: attemptScore >= 80,
    });
    await createNotionState(tx, { userId, notionId, mastery });
    const [moduleRow] = await tx.execute<{ title: string }>(sql`
      select title from public.modules where id = ${moduleId}::uuid
    `);
    return { filePath, moduleTitle: moduleRow?.title ?? 'module' };
  });

  const fileBytes = pdfBytes(`${label} ${tag}`);
  const uploaded = await admin()
    .storage.from('resources')
    .upload(seeded.filePath, fileBytes, { contentType: 'application/pdf', upsert: true });
  if (uploaded.error !== null) throw new Error(`apport non déposé : ${uploaded.error.message}`);

  return {
    formationTitle,
    formationSlug: slug(formationTitle),
    moduleFolder: `01-${slug(seeded.moduleTitle)}`,
    courseMarker,
    noteTitle,
    noteText,
    fileName,
    filePath: seeded.filePath,
    fileBytes,
    attemptScore,
    mastery,
  };
}

/** Whether an object is still present in a private bucket (service role). */
export async function storedObjectExists(bucket: string, path: string): Promise<boolean> {
  const result = await admin().storage.from(bucket).download(path);
  return result.error === null;
}

/** Whether the Supabase Auth account still exists. */
export async function authUserExists(userId: string): Promise<boolean> {
  const result = await admin().auth.admin.getUserById(userId);
  return result.error === null;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/**
 * Reads every file of a ZIP archive through its central directory (the export streams entries
 * with data descriptors, so local headers alone do not carry the sizes). Stored and deflated
 * entries are supported; anything else, or a size mismatch, fails the journey (SPEC-807 CL-5).
 */
export function readZip(archive: Buffer): Map<string, Buffer> {
  let end = -1;
  for (let index = archive.length - 22; index >= Math.max(0, archive.length - 65_557); index -= 1) {
    if (archive.readUInt32LE(index) === EOCD) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error('Archive ZIP invalide : répertoire central introuvable.');
  const count = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let entry = 0; entry < count; entry += 1) {
    if (archive.readUInt32LE(offset) !== CENTRAL) {
      throw new Error('Archive ZIP invalide : entrée centrale corrompue.');
    }
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (archive.readUInt32LE(localOffset) !== LOCAL) {
      throw new Error(`Archive ZIP invalide : en-tête local absent pour ${name}.`);
    }
    const start =
      localOffset +
      30 +
      archive.readUInt16LE(localOffset + 26) +
      archive.readUInt16LE(localOffset + 28);
    const raw = archive.subarray(start, start + compressedSize);
    let content: Buffer;
    if (method === 0) content = Buffer.from(raw);
    else if (method === 8) content = inflateRawSync(raw);
    else throw new Error(`Archive ZIP : méthode ${String(method)} non prise en charge (${name}).`);
    if (content.length !== size) throw new Error(`Archive ZIP : taille incohérente pour ${name}.`);
    files.set(name, content);
  }
  return files;
}

/** The erasure is a Python worker job now; see `test_personal_data.py` for the itinerary. */
