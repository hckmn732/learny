// Anthropic Files API for documents (SPEC-504 ET-8). In mock mode the identifier is derived from
// the bytes so tests are deterministic and no network call happens (ADR-0048).
import { createHash } from 'node:crypto';

import { AppError } from '@learny/core';

import { anthropicApiKey } from './config';
import type { ResolvedModel } from './resolve';

export interface UploadInput {
  resolved: ResolvedModel;
  bytes: Uint8Array;
  mime: string;
  filename: string;
  /** BYOK key decrypted by SPEC-505; unused for the provided AI. */
  apiKey?: string | null;
}

/** Deterministic mock identifier: `file_mock_` + first 16 hex characters of SHA-256. */
export function mockFileId(bytes: Uint8Array): string {
  return `file_mock_${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`;
}

export async function uploadDocument(
  ctx: { mode: 'live' | 'mock' },
  input: UploadInput,
): Promise<{ fileId: string }> {
  if (ctx.mode === 'mock') return { fileId: mockFileId(input.bytes) };
  if (input.resolved.provider !== 'anthropic') {
    throw new AppError(
      'FILES_UNSUPPORTED',
      'Ce fournisseur ne prend pas en charge l’API Files ; fournir le texte extrait.',
    );
  }
  const apiKey = anthropicApiKey() ?? input.apiKey ?? null;
  if (apiKey === null) {
    throw new AppError('AI_KEY_INVALID', 'Aucune clé Anthropic pour envoyer le document.');
  }
  const form = new FormData();
  const copy = Uint8Array.from(input.bytes);
  form.append('file', new Blob([copy.buffer], { type: input.mime }), input.filename);
  const response = await fetch('https://api.anthropic.com/v1/files', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
    },
    body: form,
  });
  if (!response.ok) {
    throw new AppError(
      response.status === 401 || response.status === 403 ? 'AI_KEY_INVALID' : 'AI_PROVIDER_ERROR',
      response.status === 401 || response.status === 403
        ? 'La clé Anthropic est refusée.'
        : 'L’envoi du document au fournisseur a échoué.',
      { status: response.status },
    );
  }
  const payload = (await response.json()) as { id?: unknown };
  if (typeof payload.id !== 'string' || payload.id === '') {
    throw new AppError('AI_PROVIDER_ERROR', 'Réponse invalide de l’API Files.');
  }
  return { fileId: payload.id };
}
