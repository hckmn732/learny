'use server';

// Server actions of the SPEC-505 demonstration (ADR-0049). They only act on the seeded Alex account
// and go through the real credential service and RLS. The key is read from the form, encrypted by
// the service and never returned, logged or put in a cookie.
import { revalidatePath } from 'next/cache';

import type { AiCredentialProvider } from '@learny/contracts';
import { AppError } from '@learny/core';
import { createCredential, deleteCredential } from '@learny/services/ai/credentials';

import { demoContext, demoIdentity } from './spec-505-data';
import type { DemoActionState } from './spec-505-types';

const PAGE = '/_dev/sdd/SPEC-505';

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

async function identity() {
  const found = await demoIdentity();
  if (found === null) throw new AppError('NOT_FOUND', 'Jeu de démonstration absent.');
  return found;
}

export async function createDemoCredential(
  _previous: DemoActionState,
  formData: FormData,
): Promise<DemoActionState> {
  try {
    const demo = await identity();
    const provider = field(formData, 'provider');
    const model = field(formData, 'model');
    const baseUrl = field(formData, 'baseUrl');
    const apiKey = field(formData, 'apiKey');
    if (provider === undefined || model === undefined) {
      return { error: 'Choisissez un fournisseur et un nom de modèle.' };
    }
    const created = await createCredential(demoContext(demo), {
      provider: provider as AiCredentialProvider,
      modelIds: [model],
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(apiKey === undefined ? {} : { apiKey }),
    });
    if (!created.ok) return { error: created.error.detail };
    revalidatePath(PAGE);
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof AppError ? error.detail : 'Enregistrement impossible.',
    };
  }
}

export async function deleteDemoCredential(id: string): Promise<DemoActionState> {
  try {
    const demo = await identity();
    const removed = await deleteCredential(demoContext(demo), id);
    if (!removed.ok) return { error: removed.error.detail };
    revalidatePath(PAGE);
    return { error: null };
  } catch {
    return { error: 'Suppression impossible.' };
  }
}
