// Provider catalogue (SPEC-504 ET-3, SPEC-505 ET-2): what each AI SDK provider supports, where its
// data is processed and the warning shown by BR-IA-04. The six providers and their notes are
// normative in ADR-0154 point 4; SPEC-506 and the settings screen read these flags.
import type { AiProviderValue } from '@learny/db';

export interface ProviderCapabilities {
  readonly tools: boolean;
  readonly structured: boolean;
  readonly webSearch: boolean;
  readonly citations: boolean;
  readonly files: boolean;
  readonly cache: boolean;
  readonly batch: boolean;
  readonly thinking: boolean;
}

export interface ProviderCatalogEntry {
  readonly capabilities: ProviderCapabilities;
  /** `eu`, `outside_eu`, or null when the hosting region depends on the endpoint. */
  readonly dataRegion: 'eu' | 'outside_eu' | null;
  /** BR-IA-04 — the settings screen shows the « Hors UE » badge when true. */
  readonly outsideEu: boolean;
  /** BR-IA-04 — sentence displayed under the provider form. */
  readonly dataNote: string;
  /** Human-readable provider name (`CredentialDto.providerLabel`). */
  readonly label: string;
  /** Default credential label when the learner does not name it (EF-1). */
  readonly defaultLabel: string;
  /** A custom endpoint is required for these providers. */
  readonly requiresBaseUrl: boolean;
  /** Some providers run without any key (local models). */
  readonly keyOptional: boolean;
}

const FULL: ProviderCapabilities = {
  tools: true,
  structured: true,
  webSearch: true,
  citations: true,
  files: true,
  cache: true,
  batch: true,
  thinking: true,
};

const COMMON: ProviderCapabilities = {
  tools: true,
  structured: true,
  webSearch: false,
  citations: false,
  files: false,
  cache: false,
  batch: false,
  thinking: false,
};

const OUTSIDE_EU_NOTE = 'Ce fournisseur traite les données hors de l’Union européenne.';

/** ET-3 — the six providers of `data-model.md` §9. */
export const PROVIDER_CATALOG = {
  anthropic: {
    capabilities: FULL,
    dataRegion: 'outside_eu',
    outsideEu: true,
    dataNote: OUTSIDE_EU_NOTE,
    label: 'Anthropic',
    defaultLabel: 'Anthropic',
    requiresBaseUrl: false,
    keyOptional: false,
  },
  openai: {
    capabilities: { ...COMMON, cache: true },
    dataRegion: 'outside_eu',
    outsideEu: true,
    dataNote: OUTSIDE_EU_NOTE,
    label: 'OpenAI',
    defaultLabel: 'OpenAI',
    requiresBaseUrl: false,
    keyOptional: false,
  },
  mistral: {
    capabilities: COMMON,
    dataRegion: null,
    outsideEu: false,
    dataNote: 'Vérifiez la région de traitement proposée par votre offre.',
    label: 'Mistral',
    defaultLabel: 'Mistral',
    requiresBaseUrl: false,
    keyOptional: false,
  },
  deepseek: {
    capabilities: { ...COMMON, cache: true },
    dataRegion: 'outside_eu',
    outsideEu: true,
    dataNote: OUTSIDE_EU_NOTE,
    label: 'DeepSeek',
    defaultLabel: 'DeepSeek',
    requiresBaseUrl: false,
    keyOptional: false,
  },
  openai_compatible: {
    capabilities: COMMON,
    dataRegion: null,
    outsideEu: false,
    dataNote: 'Vérifiez où ce service traite les données avant de l’utiliser.',
    label: 'Service compatible OpenAI',
    defaultLabel: 'Service compatible OpenAI',
    requiresBaseUrl: true,
    keyOptional: false,
  },
  local: {
    capabilities: COMMON,
    dataRegion: null,
    outsideEu: false,
    dataNote: 'Les données restent sur votre machine.',
    label: 'Modèle local',
    defaultLabel: 'Modèle local',
    requiresBaseUrl: true,
    keyOptional: true,
  },
} as const satisfies Record<AiProviderValue, ProviderCatalogEntry>;

export function providerSupports(
  provider: AiProviderValue,
  feature: keyof ProviderCapabilities,
): boolean {
  return PROVIDER_CATALOG[provider].capabilities[feature];
}

/** CA-5 — the data warning of one provider, in one call. */
export function providerRegion(provider: AiProviderValue): {
  outsideEu: boolean;
  dataNote: string;
  providerLabel: string;
  defaultLabel: string;
} {
  const entry = PROVIDER_CATALOG[provider];
  return {
    outsideEu: entry.outsideEu,
    dataNote: entry.dataNote,
    providerLabel: entry.label,
    defaultLabel: entry.defaultLabel,
  };
}
