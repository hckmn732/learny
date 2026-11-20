// Redacted snapshot of the SPEC-110 owner-role demonstration. Keeping it static makes the `_dev`
// reference independent from the mutable E2E database while preserving the repository's public
// credential projection and billing rules (ET-5).
import type {
  AiCallStatusValue,
  AiProviderValue,
  CredentialStatusValue,
  SubscriptionStatusValue,
} from '@learny/db';

const DAY = '2026-11-11';
const PERIOD_END = new Date('2026-12-11T12:20:00Z');

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

const SPEC_110_FALLBACK: Spec110Data = {
  credentials: [
    {
      provider: 'anthropic',
      label: 'Clé Anthropic d’Alex',
      keyLast4: 'a1b2',
      status: 'qualified',
      outsideEu: false,
    },
    {
      provider: 'deepseek',
      label: 'Clé DeepSeek (hors UE)',
      keyLast4: 'c3d4',
      status: 'failed',
      outsideEu: true,
    },
  ],
  tasks: [
    {
      task: 'programme',
      modelId: 'claude-sonnet-4-5-20250929',
      managed: false,
      usable: true,
      credentialLabel: 'Clé Anthropic d’Alex',
      credentialStatus: 'qualified',
    },
    {
      task: 'course',
      modelId: 'claude-sonnet-4-5-20250929',
      managed: false,
      usable: true,
      credentialLabel: 'Clé Anthropic d’Alex',
      credentialStatus: 'qualified',
    },
    {
      task: 'gaps',
      modelId: 'deepseek-chat',
      managed: true,
      usable: false,
      credentialLabel: 'Clé DeepSeek (hors UE)',
      credentialStatus: 'failed',
    },
    {
      task: 'tutor',
      modelId: 'claude-haiku-4-5-20251001',
      managed: false,
      usable: true,
      credentialLabel: 'Clé Anthropic d’Alex',
      credentialStatus: 'qualified',
    },
    {
      task: 'light',
      modelId: 'claude-haiku-4-5-20251001',
      managed: true,
      usable: true,
      credentialLabel: null,
      credentialStatus: null,
    },
  ],
  calls: [
    {
      task: 'tutor',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      managed: true,
      status: 'ok',
      costUsd: '0.420000',
      createdAt: '2026-11-11T09:00:00.000Z',
    },
    {
      task: 'course',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      managed: true,
      status: 'ok',
      costUsd: '0.170000',
      createdAt: '2026-11-11T10:00:00.000Z',
    },
    {
      task: 'programme',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      managed: false,
      status: 'ok',
      costUsd: '0.250000',
      createdAt: '2026-11-11T11:00:00.000Z',
    },
    {
      task: 'gaps',
      provider: 'deepseek',
      model: 'deepseek-chat',
      managed: true,
      status: 'refused',
      costUsd: '0.000000',
      createdAt: '2026-11-11T11:10:00.000Z',
    },
  ],
  spend: {
    day: DAY,
    amountUsd: '0.590000',
    capUsd: '1.500000',
    managedCalls: 3,
    byokCalls: 1,
    billedCalls: 2,
  },
  subscription: {
    status: 'active',
    capUsd: '1.500000',
    currentPeriodEnd: PERIOD_END.toISOString(),
    stripeCustomerId: 'cus_demo_alex',
  },
};

export function loadSpec110Demo(): Spec110Data {
  return SPEC_110_FALLBACK;
}
