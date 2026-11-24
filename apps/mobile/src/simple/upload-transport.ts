// Transport réseau de la file de dépôt (SPEC-4003 EF-2, ET-2 ; SPEC-206).
//
// Un fichier : réservation (`sources.uploads.create`), envoi binaire sur l'URL signée, puis
// finalisation (`resources.finalize`) qui mesure les octets réels. Un lien : `sources.links.create`.
// L'`Idempotency-Key` est l'identifiant stable de la tâche : une reprise ne réserve pas deux fois.
import * as FileSystem from 'expo-file-system/legacy';

import { requireApiClient } from '../api/registry';
import { configResult } from '../config';

import type { UploadTask, UploadTransport } from './upload-queue';

/** Réponse d'erreur d'un envoi binaire : le statut suffit au message générique. */
export class UploadHttpError extends Error {
  constructor(readonly status: number) {
    super(`Envoi refusé (${String(status)}).`);
    this.name = 'UploadHttpError';
  }
}

/**
 * Réécrit l'hôte de l'URL signée pour l'appareil : la pile locale signe avec `127.0.0.1`, qui
 * désigne l'émulateur lui-même. Quand l'API est jointe par `10.0.2.2`, l'URL d'envoi garde son
 * schéma, son port et son chemin mais prend l'hôte de l'API.
 */
export function deviceUploadUrl(uploadUrl: string): string {
  if (!configResult.ok) return uploadUrl;
  try {
    const api = new URL(configResult.config.apiUrl);
    const signed = new URL(uploadUrl);
    if (
      api.hostname === signed.hostname ||
      api.hostname === 'localhost' ||
      api.hostname === '127.0.0.1'
    ) {
      return uploadUrl;
    }
    signed.hostname = api.hostname;
    return signed.toString();
  } catch {
    return uploadUrl;
  }
}

/** Transport de production de la file. */
export function simpleUploadTransport(formationId: string): UploadTransport {
  return async (task: UploadTask, onProgress: (sentBytes: number) => void) => {
    const api = requireApiClient().api;
    if (task.kind === 'link') {
      if (task.url === undefined) throw new Error('Lien manquant.');
      const created = await api.simpleLink(
        { params: { fid: formationId }, body: { url: task.url, role: task.role } },
        { idempotencyKey: task.id },
      );
      onProgress(task.sizeBytes);
      return { resourceId: created.resourceId };
    }

    if (task.uri === undefined) throw new Error('Fichier local manquant.');
    const created = await api.simpleUpload(
      {
        params: { fid: formationId },
        body: {
          fileName: task.name,
          mime: task.mime,
          sizeBytes: Math.max(1, task.sizeBytes),
          role: task.role,
        },
      },
      { idempotencyKey: task.id },
    );

    const anonKey = configResult.ok ? configResult.config.supabaseAnonKey : '';
    const upload = FileSystem.createUploadTask(
      deviceUploadUrl(created.uploadUrl),
      task.uri,
      {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { apikey: anonKey, 'content-type': task.mime },
      },
      (progress) => {
        onProgress(progress.totalBytesSent);
      },
    );
    const result = await upload.uploadAsync();
    if (result === undefined || result === null || result.status < 200 || result.status >= 300) {
      throw new UploadHttpError(result?.status ?? 0);
    }

    await api.resourcesFinalize({ params: { rid: created.resourceId } });
    if (created.role !== task.role) {
      await api.resourceRole({ params: { rid: created.resourceId }, body: { role: task.role } });
    }
    onProgress(task.sizeBytes);
    return { resourceId: created.resourceId };
  };
}
