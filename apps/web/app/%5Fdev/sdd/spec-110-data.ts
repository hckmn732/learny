// Owner-role reads of the SPEC-110 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// The whole demonstration runs inside `withRollback`: two personal keys (one qualified, one failed
// outside the EU), five task choices, four calls of the reference day and one subscription
// disappear at the end of the request. The encrypted bytes are written through the repository and
// never read back into the payload: the page only receives the redacted public projection (ET-5).
import {
  createCredential,
  getSpendToday,
  getSubscription,
  listAiCalls,
  listCredentials,
  listTaskModels,
  recordAiCall,
  setTaskModel,
  upsertSubscription,
  type AiCallStatusValue,
  type AiProviderValue,
  type CredentialStatusValue,
  type PublicAiCredential,
  type SubscriptionStatusValue,
} from '@learny/db';
import { createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';

const FIXED = new Date('2026-11-11T12:20:00Z');
const DAY = '2026-11-11';
const PERIOD_END = new Date('2026-12-11T12:20:00Z');

/** ET-2 — deterministic test ciphertext, only in the demonstration; no real provider key exists. */
function demoEncryptedKey(seed: number): Uint8Array {
  const iv = new Uint8Array(12).fill(seed);
  const tag = new Uint8Array(16).fill(seed + 1);
  const ciphertext = new TextEncoder().encode('learny-test-only');
  const bytes = new Uint8Array(iv.length + tag.length + ciphertext.length);
  bytes.set(iv, 0);
  bytes.set(tag, iv.length);
  bytes.set(ciphertext, iv.length + tag.length);
  return bytes;
}

export interface Spec110Credential {
  provider: AiProviderValue;
  label: string;
  keyLast4: string | null;
  status: CredentialStatusValue;
  outsideEu: boolean;
}

export interface Spec110Task {
  task: string;
  modelId: string;
  managed: boolean;
  usable: boolean;
  credentialLabel: string | null;
  credentialStatus: CredentialStatusValue | null;
}

export interface Spec110Call {
  task: string;
  provider: AiProviderValue;
  model: string;
  managed: boolean;
  status: AiCallStatusValue;
  costUsd: string;
  createdAt: string;
}

export interface Spec110Spend {
  day: string;
  amountUsd: string;
  capUsd: string;
  managedCalls: number;
  byokCalls: number;
  billedCalls: number;
}

export interface Spec110Subscription {
  status: SubscriptionStatusValue;
  capUsd: string;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
}

export interface Spec110Data {
  credentials: Spec110Credential[];
  tasks: Spec110Task[];
  calls: Spec110Call[];
  spend: Spec110Spend;
  subscription: Spec110Subscription | null;
}

function publicCredential(credential: PublicAiCredential): Spec110Credential {
  // Explicit copy of the five allowed fields; there is no encrypted key in the public type.
  return {
    provider: credential.provider,
    label: credential.label,
    keyLast4: credential.keyLast4,
    status: credential.status,
    outsideEu: credential.outsideEu,
  };
}

/** Full demonstration payload; every read is rolled back at the end of the request. */
export async function loadSpec110Demo(): Promise<Spec110Data> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx, { firstName: 'Alex', timezone: 'Europe/Paris' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
    });

    const anthropic = await createCredential(tx, {
      userId: user.id,
      provider: 'anthropic',
      label: 'Clé Anthropic d’Alex',
      modelIds: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
      encryptedKey: demoEncryptedKey(0x11),
      keyLast4: 'a1b2',
      status: 'qualified',
      qualification: { latencyMs: 240, jsonMode: true },
      outsideEu: false,
      qualifiedAt: new Date('2026-11-09T09:00:00Z'),
    });
    const deepseek = await createCredential(tx, {
      userId: user.id,
      provider: 'deepseek',
      label: 'Clé DeepSeek (hors UE)',
      modelIds: ['deepseek-chat'],
      encryptedKey: demoEncryptedKey(0x22),
      keyLast4: 'c3d4',
      status: 'failed',
      qualification: { latencyMs: 900, errorCode: 'HTTP_401' },
      outsideEu: true,
    });

    const choices: Array<{
      task: 'programme' | 'course' | 'gaps' | 'tutor' | 'light';
      credentialId: string | null;
      modelId: string;
    }> = [
      {
        task: 'programme',
        credentialId: anthropic.id,
        modelId: 'claude-sonnet-4-5-20250929',
      },
      {
        task: 'course',
        credentialId: anthropic.id,
        modelId: 'claude-sonnet-4-5-20250929',
      },
      { task: 'gaps', credentialId: deepseek.id, modelId: 'deepseek-chat' },
      {
        task: 'tutor',
        credentialId: anthropic.id,
        modelId: 'claude-haiku-4-5-20251001',
      },
      { task: 'light', credentialId: null, modelId: 'claude-haiku-4-5-20251001' },
    ];
    for (const choice of choices) {
      await setTaskModel(tx, { userId: user.id, ...choice });
    }

    await upsertSubscription(tx, {
      userId: user.id,
      stripeCustomerId: 'cus_demo_alex',
      stripeSubscriptionId: 'sub_demo_alex',
      status: 'active',
      currentPeriodEnd: PERIOD_END,
      dailyCapUsd: '1.5',
    });

    const calls: Array<{
      task: 'programme' | 'course' | 'gaps' | 'tutor' | 'light';
      provider: 'anthropic' | 'deepseek';
      model: string;
      managed: boolean;
      status: AiCallStatusValue;
      costUsd: string;
      createdAt: Date;
    }> = [
      {
        task: 'tutor',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        managed: true,
        status: 'ok',
        costUsd: '0.420000',
        createdAt: new Date('2026-11-11T09:00:00Z'), // 10:00 à Paris
      },
      {
        task: 'course',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        managed: true,
        status: 'ok',
        costUsd: '0.170000',
        createdAt: new Date('2026-11-11T10:00:00Z'), // 11:00 à Paris
      },
      {
        task: 'programme',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        managed: false,
        status: 'ok',
        costUsd: '0.250000',
        createdAt: new Date('2026-11-11T11:00:00Z'), // 12:00 à Paris, BYOK
      },
      {
        task: 'gaps',
        provider: 'deepseek',
        model: 'deepseek-chat',
        managed: true,
        status: 'refused',
        costUsd: '0.000000',
        createdAt: new Date('2026-11-11T11:10:00Z'), // 12:10 à Paris, aucun appel fournisseur
      },
    ];
    for (const call of calls) {
      await recordAiCall(tx, {
        userId: user.id,
        formationId: programme.formationId,
        latencyMs: call.status === 'refused' ? 0 : 320,
        ...call,
      });
    }

    const subscriptions = await getSubscription(tx, user.id);
    const publicCredentials = await listCredentials(tx, user.id);
    const tasks = await listTaskModels(tx, user.id);
    const journal = await listAiCalls(tx, { userId: user.id, limit: 10 });
    const amountUsd = await getSpendToday(tx, { userId: user.id, now: FIXED });

    return {
      credentials: publicCredentials.map(publicCredential),
      tasks: tasks.map((task) => ({
        task: task.task,
        modelId: task.modelId,
        managed: task.managed,
        usable: task.usable,
        credentialLabel: task.credentialLabel,
        credentialStatus: task.credentialStatus,
      })),
      calls: journal.map((call) => ({
        task: call.task,
        provider: call.provider,
        model: call.model,
        managed: call.managed,
        status: call.status,
        costUsd: call.costUsd,
        createdAt: call.createdAt.toISOString(),
      })),
      spend: {
        day: DAY,
        amountUsd,
        capUsd: subscriptions?.dailyCapUsd ?? '1.500000',
        managedCalls: journal.filter((call) => call.managed).length,
        byokCalls: journal.filter((call) => !call.managed).length,
        billedCalls: journal.filter((call) => call.managed && Number(call.costUsd) > 0).length,
      },
      subscription:
        subscriptions === null
          ? null
          : {
              status: subscriptions.status,
              capUsd: subscriptions.dailyCapUsd,
              currentPeriodEnd: subscriptions.currentPeriodEnd?.toISOString() ?? null,
              stripeCustomerId: subscriptions.stripeCustomerId,
            },
    };
  });
}
