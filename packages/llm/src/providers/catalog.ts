// Provider catalogue (SPEC-504 ET-3): what each AI SDK provider supports and where its data is
// processed. Qualification (SPEC-506) and the UI warning of BR-IA-04 read these flags; SPEC-505
// fills `dataRegion` when it knows the hosting region of a custom endpoint.
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
  /** `eu`, `outside_eu`, or null until SPEC-505 determines it from the endpoint. */
  readonly dataRegion: 'eu' | 'outside_eu' | null;
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

/** ET-3 — the six providers of `data-model.md` §9. */
export const PROVIDER_CATALOG = {
  anthropic: { capabilities: FULL, dataRegion: null, requiresBaseUrl: false, keyOptional: false },
  openai: {
    capabilities: { ...COMMON, cache: true },
    dataRegion: null,
    requiresBaseUrl: false,
    keyOptional: false,
  },
  mistral: {
    capabilities: COMMON,
    dataRegion: null,
    requiresBaseUrl: false,
    keyOptional: false,
  },
  deepseek: {
    capabilities: { ...COMMON, cache: true },
    dataRegion: null,
    requiresBaseUrl: false,
    keyOptional: false,
  },
  openai_compatible: {
    capabilities: COMMON,
    dataRegion: null,
    requiresBaseUrl: true,
    keyOptional: false,
  },
  local: {
    capabilities: COMMON,
    dataRegion: null,
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
