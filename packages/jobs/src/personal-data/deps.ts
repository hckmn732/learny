// External ports of the export and deletion jobs (SPEC-211 ET-2, EF-7, CL-8).
//
// The ZIP is uploaded to the private `exports` bucket and the apports are read from the private
// `resources` bucket with the service role: the job acts on behalf of a learner who may already be
// deleted. Every port is injectable, so the integration suite never touches Supabase Storage nor
// Auth. URLs, tokens and e-mail addresses are never logged (ET-7).
import { createReadStream } from 'node:fs';

import type { StorageBucket } from '@learny/db';

import type { ArchiveObjectReader } from './archive';

export interface ZipUploader {
  upload(input: {
    bucket: StorageBucket;
    path: string;
    filePath: string;
    sizeBytes: number;
  }): Promise<void>;
  remove(bucket: StorageBucket, path: string): Promise<void>;
}

export interface AccountAdmin {
  /** Deletes the Auth user; a missing user is a success (idempotent replay). */
  deleteUser(userId: string): Promise<void>;
  exists(userId: string): Promise<boolean>;
}

export interface ExportDeps {
  readObject: ArchiveObjectReader;
  uploader: ZipUploader;
}

export interface DeletionDeps {
  removeObject: (bucket: StorageBucket, path: string) => Promise<void>;
  admin: AccountAdmin;
}

interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
}

function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (url === undefined || anonKey === undefined || serviceKey === undefined) return null;
  if (url === '' || anonKey === '' || serviceKey === '') return null;
  return { url: url.replace(/\/+$/, ''), anonKey, serviceKey };
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

/** Streaming upload of a local ZIP file to Supabase Storage (upsert: a replay overwrites). */
export async function uploadZipFile(
  config: SupabaseConfig,
  bucket: StorageBucket,
  storagePath: string,
  filePath: string,
  sizeBytes: number,
): Promise<void> {
  const response = await fetch(
    `${config.url}/storage/v1/object/${bucket}/${encodePath(storagePath)}`,
    {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${config.serviceKey}`,
        'content-type': 'application/zip',
        'content-length': String(sizeBytes),
        'x-upsert': 'true',
      },
      // Node streams a request body without buffering the archive (duplex is required by fetch).
      body: createReadStream(filePath) as unknown as BodyInit,
      duplex: 'half',
    } as RequestInit,
  );
  if (!response.ok) {
    throw new Error(`Stockage indisponible (${String(response.status)}).`);
  }
}

export async function removeStoredObject(
  config: SupabaseConfig,
  bucket: StorageBucket,
  storagePath: string,
): Promise<void> {
  const response = await fetch(`${config.url}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${config.serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prefixes: [storagePath] }),
  });
  // A missing blob is already removed (idempotent step).
  if (!response.ok && response.status !== 404 && response.status !== 400) {
    throw new Error(`Stockage indisponible (${String(response.status)}).`);
  }
}

function supabaseUploader(config: SupabaseConfig): ZipUploader {
  return {
    async upload(input) {
      await uploadZipFile(config, input.bucket, input.path, input.filePath, input.sizeBytes);
    },
    async remove(bucket, storagePath) {
      await removeStoredObject(config, bucket, storagePath);
    },
  };
}

/** Reads one apport of the private bucket with the service role (50 MB is the upload bound). */
function supabaseReader(config: SupabaseConfig): ArchiveObjectReader {
  return async (storagePath) => {
    const response = await fetch(
      `${config.url}/storage/v1/object/authenticated/resources/${encodePath(storagePath)}`,
      {
        headers: {
          apikey: config.anonKey,
          authorization: `Bearer ${config.serviceKey}`,
        },
      },
    );
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error(`Stockage indisponible (${String(response.status)}).`);
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > 64 * 1024 * 1024) {
      throw new Error('Apport trop volumineux pour l’archive.');
    }
    return new Uint8Array(await response.arrayBuffer());
  };
}

function supabaseAdmin(config: SupabaseConfig): AccountAdmin {
  return {
    async deleteUser(userId) {
      const response = await fetch(`${config.url}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          apikey: config.serviceKey,
          authorization: `Bearer ${config.serviceKey}`,
        },
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Suppression du compte impossible (${String(response.status)}).`);
      }
    },
    async exists(userId) {
      const response = await fetch(`${config.url}/auth/v1/admin/users/${userId}`, {
        headers: {
          apikey: config.serviceKey,
          authorization: `Bearer ${config.serviceKey}`,
        },
      });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`Auth indisponible (${String(response.status)}).`);
      return true;
    },
  };
}

export interface MemoryExportDeps extends ExportDeps {
  files: Map<string, Uint8Array>;
  uploads: Map<string, { bytes: Uint8Array; entries: string[] }>;
}

/** In-memory storage for the tests and the demonstration: no network, no signed URL. */
export function createMemoryExportDeps(
  files: Map<string, Uint8Array> = new Map(),
): MemoryExportDeps {
  const uploads = new Map<string, { bytes: Uint8Array; entries: string[] }>();
  return {
    files,
    uploads,
    readObject: (storagePath) => Promise.resolve(files.get(storagePath) ?? null),
    uploader: {
      async upload(input) {
        const { readFile } = await import('node:fs/promises');
        uploads.set(`${input.bucket}/${input.path}`, {
          bytes: new Uint8Array(await readFile(input.filePath)),
          entries: [],
        });
      },
      remove(bucket, storagePath) {
        uploads.delete(`${bucket}/${storagePath}`);
        return Promise.resolve();
      },
    },
  };
}

/** Production ports; throws when the server configuration is incomplete. */
export function defaultExportDeps(): ExportDeps {
  const config = supabaseConfig();
  if (config === null) {
    throw new Error('Stockage Supabase non configuré pour l’export.');
  }
  return { readObject: supabaseReader(config), uploader: supabaseUploader(config) };
}

export function defaultDeletionDeps(): DeletionDeps {
  const config = supabaseConfig();
  if (config === null) {
    throw new Error('Supabase non configuré pour la suppression.');
  }
  return {
    removeObject: (bucket, storagePath) => removeStoredObject(config, bucket, storagePath),
    admin: supabaseAdmin(config),
  };
}

/** Explicit type re-export for the callers that inject a fake deletion admin. */
export type { StorageBucket };
