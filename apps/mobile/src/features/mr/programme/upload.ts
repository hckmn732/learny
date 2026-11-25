// Téléversement d'un apport fichier (SPEC-206 : réservation, envoi binaire, finalisation).
//
// Trois appels, dans l'ordre du contrat : `uploads.create` réserve un identifiant et une URL
// signée, l'URL reçoit les octets, `resources.finalize` mesure ce qui a réellement été envoyé.
// L'`Idempotency-Key` est l'identifiant de l'intention : un renvoi ne réserve pas deux apports.
import * as FileSystem from 'expo-file-system/legacy';

import { requireApiClient } from '../../../api/registry';
import { uuidV4 } from '../../../api/uuid';
import { configResult } from '../../../config';
import { deviceUploadUrl } from '../../../simple/upload-transport';

import type { PickedApport } from './pickers';
import { apportTitleFromName } from './view-model';

/** A deposit that the API or the storage refused. */
export class ApportUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApportUploadError';
  }
}

/**
 * Sends one apport to a chapter and returns its identifier. The caller reloads the module screen
 * afterwards: the status of the new apport (`queued`) belongs to the server.
 */
export async function uploadApport(chapterId: string, file: PickedApport): Promise<string> {
  const api = requireApiClient().api;
  const created = await api.uploadsCreate(
    {
      params: { cid: chapterId },
      body: {
        fileName: file.name,
        mime: file.mime,
        sizeBytes: Math.max(1, file.sizeBytes),
        title: apportTitleFromName(file.name),
      },
    },
    { idempotencyKey: uuidV4() },
  );

  const anonKey = configResult.ok ? configResult.config.supabaseAnonKey : '';
  const task = FileSystem.createUploadTask(deviceUploadUrl(created.uploadUrl), file.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { apikey: anonKey, 'content-type': file.mime },
  });
  const result = await task.uploadAsync();
  if (result === undefined || result === null || result.status < 200 || result.status >= 300) {
    throw new ApportUploadError(`Envoi refusé (${String(result?.status ?? 0)}).`);
  }

  await api.resourcesFinalize({ params: { rid: created.resourceId } });
  return created.resourceId;
}