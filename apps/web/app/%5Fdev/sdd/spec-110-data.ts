// Redacted snapshot of the SPEC-110 owner-role demonstration. Keeping it static makes the `_dev`
// reference independent from the mutable E2E database while preserving the repository's public
// credential projection and subscription rules (ET-5).
import type {
  AiProviderValue,
  CredentialStatusValue,
  SubscriptionStatusValue,
} from '@learny/db';

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
  modelId: string | null;
  usable: boolean;
  credentialLabel: string | null;
  credentialStatus: CredentialStatusValue | null;
}

export interface Spec110Subscription {
  status: SubscriptionStatusValue;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
}

export interface Spec110Data {
  credentials: Spec110Credential[];
  tasks: Spec110Task[];
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
      usable: true,
      credentialLabel: 'Clé Anthropic d’Alex',
      credentialStatus: 'qualified',
    },
    {
      task: 'course',
      modelId: 'claude-sonnet-4-5-20250929',
      usable: true,
      credentialLabel: 'Clé Anthropic d’Alex',
      credentialStatus: 'qualified',
    },
    {
      task: 'gaps',
      modelId: 'deepseek-chat',
      usable: false,
      credentialLabel: 'Clé DeepSeek (hors UE)',
      credentialStatus: 'failed',
    },
    {
      task: 'tutor',
      modelId: 'claude-haiku-4-5-20251001',
      usable: true,
      credentialLabel: 'Clé Anthropic d’Alex',
      credentialStatus: 'qualified',
    },
    {
      task: 'light',
      modelId: null,
      usable: false,
      credentialLabel: null,
      credentialStatus: null,
    },
  ],
  subscription: {
    status: 'active',
    currentPeriodEnd: PERIOD_END.toISOString(),
    stripeCustomerId: 'cus_demo_alex',
  },
};

export function loadSpec110Demo(): Spec110Data {
  return SPEC_110_FALLBACK;
}
