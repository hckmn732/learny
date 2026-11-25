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

const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '[::1]', '::1'];

/**
 * Réécrit l'hôte d'une URL signée **locale** pour l'appareil : la pile locale signe avec
 * `127.0.0.1`, qui désigne l'émulateur lui-même ; quand l'API est jointe par `10.0.2.2`, l'URL
 * d'envoi garde son schéma, son port et son chemin mais prend l'hôte de l'API. Une URL publique
 * (le stockage d'un environnement déployé, sur son propre domaine) n'est jamais réécrite : le
 * fichier partirait vers le site web au lieu du stockage (QA 2026-11-25).
 */
export function rewriteUploadHost(uploadUrl: string, apiUrl: string): string {
  try {
    const api = new URL(apiUrl);
    const signed = new URL(uploadUrl);
    if (!LOOPBACK_HOSTS.includes(signed.hostname) || LOOPBACK_HOSTS.includes(api.hostname)) {
      return uploadUrl;
    }
    signed.hostname = api.hostname;
    return signed.toString();
  } catch {
    return uploadUrl;
  }
}

/** L'URL d'envoi binaire pour cet appareil (voir `rewriteUploadHost`). */
export function deviceUploadUrl(uploadUrl: string): string {
  if (!configResult.ok) return uploadUrl;
  return rewriteUploadHost(uploadUrl, configResult.config.apiUrl);
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
    // Un URI `file:///sdcard/…` vient du partage externe : il est d'abord copié dans le cache
    // interne, seul espace que la tâche d'envoi peut lire sans permission de stockage.
    let uri = task.uri;
    if (uri.startsWith('file:///sdcard/') && FileSystem.cacheDirectory !== null) {
      const extension = task.name.includes('.') ? task.name.split('.').pop() : 'bin';
      const target = `${FileSystem.cacheDirectory}simple-${task.id}.${String(extension)}`;
      await FileSystem.copyAsync({ from: uri, to: target });
      uri = target;
    }
    const upload = FileSystem.createUploadTask(
      deviceUploadUrl(created.uploadUrl),
      uri,
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
