// Server data of the SPEC-505 demonstration (ADR-0049). The page works on the seeded Alex account
// through the real service and RLS; only the storage panel reads the ciphertext length and IV,
// never the key. No query here returns a plaintext key.
import { randomUUID } from 'node:crypto';

import { AI_CREDENTIAL_PROVIDERS } from '@learny/contracts';
import { serviceDb, sql } from '@learny/db';
import { PROVIDER_CATALOG } from '@learny/llm';
import { createServiceContext } from '@learny/services';
import { listCredentials } from '@learny/services/ai/credentials';

import type { DemoProviderOption, DemoStorage, Spec505DemoData } from './spec-505-types';

export const DEMO_EMAIL = 'alex.perrin@demo.learny.test';

export interface DemoIdentity {
  userId: string;
}

const cache = new Map<string, DemoIdentity | null>();

export async function demoIdentity(): Promise<DemoIdentity | null> {
  const cached = cache.get(DEMO_EMAIL);
  if (cached !== undefined) return cached;
  const rows = await serviceDb().execute<{ user_id: string }>(sql`
    select p.id::text as user_id
    from public.profiles p
    where p.email = ${DEMO_EMAIL}
  `);
  const userId = rows[0]?.user_id;
  const identity = userId === undefined ? null : { userId };
  cache.set(DEMO_EMAIL, identity);
  return identity;
}

export function demoContext(identity: DemoIdentity) {
  return createServiceContext({
    userId: identity.userId,
    email: DEMO_EMAIL,
    requestId: `sdd-505-${randomUUID().slice(0, 8)}`,
  });
}

export function providerOptions(): DemoProviderOption[] {
  return AI_CREDENTIAL_PROVIDERS.map((provider) => {
    const entry = PROVIDER_CATALOG[provider];
    return {
      value: provider,
      label: entry.label,
      outsideEu: entry.outsideEu,
      dataNote: entry.dataNote,
      requiresBaseUrl: entry.requiresBaseUrl,
      keyOptional: entry.keyOptional,
    };
  });
}

async function storageOf(credentialId: string, userId: string): Promise<DemoStorage | null> {
  const rows = await serviceDb().execute<{ bytes: number | null; iv_hex: string | null }>(sql`
    select
      octet_length(encrypted_key) as bytes,
      encode(substring(encrypted_key from 1 for 8), 'hex') as iv_hex
    from public.ai_credentials
    where id = ${credentialId}::uuid and user_id = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined || row.bytes === null || row.iv_hex === null) return null;
  return { bytes: row.bytes, ivHex: row.iv_hex };
}

export async function loadSpec505Demo(): Promise<Spec505DemoData> {
  const providers = providerOptions();
  try {
    const identity = await demoIdentity();
    if (identity === null) {
      return {
        credentials: [],
        providers,
        storage: null,
        rawJson: '{}',
        error: 'Jeu de démonstration absent : lancer `pnpm db:seed:demo`.',
      };
    }
    const listed = await listCredentials(demoContext(identity));
    if (!listed.ok) {
      return {
        credentials: [],
        providers,
        storage: null,
        rawJson: '{}',
        error: listed.error.detail,
      };
    }
    const credentials = listed.value;
    const latest = credentials[credentials.length - 1];
    const storage = latest === undefined ? null : await storageOf(latest.id, identity.userId);
    return {
      credentials,
      providers,
      storage,
      rawJson: latest === undefined ? '{}' : JSON.stringify(latest, null, 2),
      error: null,
    };
  } catch (error) {
    return {
      credentials: [],
      providers,
      storage: null,
      rawJson: '{}',
      error: error instanceof Error ? error.message : 'Démonstration indisponible.',
    };
  }
}
