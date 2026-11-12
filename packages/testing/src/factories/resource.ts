// Resource factory (SPEC-115 EF-6). Notes carry text; files carry a deterministic storage path and
// links carry a reserved `.test` URL. The owner may be the formation owner or an active member.
import { randomUUID } from 'node:crypto';

import { sql, type DbTx } from '@learny/db';

import { assertChapterBelongsTo, assertFormationAccess, insert, type IdRow } from './helpers';

export type ResourceKind =
  'note' | 'pdf' | 'web' | 'youtube' | 'image' | 'audio' | 'video' | 'exam_guide';

export interface ResourceFactoryOverrides {
  id?: string;
  ownerId: string;
  formationId: string;
  chapterId?: string | null;
  kind?: ResourceKind;
  title?: string;
  content?: string;
  mime?: string;
  size?: number;
}

export async function createResource(
  tx: DbTx,
  overrides: ResourceFactoryOverrides,
): Promise<{ id: string }> {
  await assertFormationAccess(tx, overrides.formationId, overrides.ownerId);
  const kind = overrides.kind ?? 'note';
  if (overrides.chapterId !== undefined && overrides.chapterId !== null) {
    const rows = await tx.execute<{ module_id: string }>(
      sql`select module_id::text as module_id from public.chapters where id = ${overrides.chapterId}::uuid`,
    );
    const moduleId = rows[0]?.module_id;
    if (moduleId === undefined) throw new Error('Fabrique ressource : chapitre inconnu.');
    await assertChapterBelongsTo(tx, overrides.chapterId, moduleId, overrides.formationId);
  }

  const id = overrides.id ?? randomUUID();
  const file = ['pdf', 'image', 'audio', 'video'].includes(kind);
  const link = ['web', 'youtube'].includes(kind);
  const mime = overrides.mime ?? (kind === 'note' ? 'text/markdown' : 'application/octet-stream');
  const storagePath = file ? `${overrides.ownerId}/${id}/resource.bin` : null;
  const url = link ? `https://demo.learny.test/${id}` : null;
  const content =
    kind === 'note' || kind === 'web' || kind === 'youtube'
      ? (overrides.content ?? 'Contenu de fabrique.')
      : (overrides.content ?? null);

  const rows = await insert<IdRow>(
    tx,
    'resource',
    sql`
      insert into public.resources (
        id, owner_id, formation_id, chapter_id, kind, title, content_text, storage_path,
        url, mime, size_bytes, status
      )
      values (
        ${id}::uuid,
        ${overrides.ownerId}::uuid,
        ${overrides.formationId}::uuid,
        ${overrides.chapterId ?? null}::uuid,
        ${kind},
        ${overrides.title ?? 'Ressource de fabrique'},
        ${content},
        ${storagePath},
        ${url},
        ${mime},
        ${overrides.size ?? null},
        'ready'
      )
      returning id::text as id
    `,
  );
  const row = rows[0];
  if (row === undefined) throw new Error('Fabrique ressource : aucune ligne insérée.');
  return row;
}
