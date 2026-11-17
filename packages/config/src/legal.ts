// Legal identity and document versions (SPEC-806 ET-1, EF-2; ADR-0045).
//
// The legal entity is not known by the repository: every identity value comes from the environment
// and an absent value stays explicitly « [à compléter] ». No caller ever invents an entity, and a
// production pre-publication check must report the missing names instead of hiding them.
import { z } from 'zod';

import { LEGAL_VERSIONS } from './product';

/** Exact marker shown where the legal identity is not provided (ADR-0045). */
export const LEGAL_PLACEHOLDER = '[à compléter]';

/** Identity variables, in the order the legal documents present them. */
export const LEGAL_IDENTITY_KEYS = [
  'LEGAL_ENTITY_NAME',
  'LEGAL_ENTITY_ADDRESS',
  'LEGAL_CONTACT_EMAIL',
  'LEGAL_HOST_NAME',
] as const;

/** Version variables of the acceptance documents. */
export const LEGAL_VERSION_KEYS = ['LEGAL_CGU_VERSION', 'LEGAL_PRIVACY_VERSION'] as const;

/** Documents whose acceptance is tracked by `legal_acceptances` (BR-ACC-02). */
export const LEGAL_DOCUMENT_KEYS = ['cgu', 'privacy'] as const;

export type LegalIdentityKey = (typeof LEGAL_IDENTITY_KEYS)[number];
export type LegalVersionKey = (typeof LEGAL_VERSION_KEYS)[number];
export type LegalDocumentKey = (typeof LEGAL_DOCUMENT_KEYS)[number];

export interface LegalIdentity {
  entityName: string;
  entityAddress: string;
  contactEmail: string;
  hostName: string;
}

export interface LegalVersions {
  cgu: string;
  privacy: string;
}

export interface LegalConfig {
  identity: LegalIdentity;
  versions: LegalVersions;
  /** Identity variables still showing the placeholder (names only, never a value). */
  missingIdentity: LegalIdentityKey[];
  /** True only when all four identity values are provided. */
  complete: boolean;
}

/** Raised with the field name only: a rejected value is never echoed (it can be personal data). */
export class LegalConfigError extends Error {
  readonly field: string;

  constructor(field: string, reason: string) {
    super(`${field} : ${reason}`);
    this.name = 'LegalConfigError';
    this.field = field;
  }
}

const identitySchema = z.object({
  LEGAL_ENTITY_NAME: z.string().trim().min(1).max(200).optional(),
  LEGAL_ENTITY_ADDRESS: z.string().trim().min(1).max(400).optional(),
  LEGAL_CONTACT_EMAIL: z.email().max(254).optional(),
  LEGAL_HOST_NAME: z.string().trim().min(1).max(200).optional(),
});

const versionSchema = z.string().trim().min(1).max(40);
const versionEntrySchema = z.object({
  LEGAL_CGU_VERSION: versionSchema.optional(),
  LEGAL_PRIVACY_VERSION: versionSchema.optional(),
});

function readValue(raw: Record<string, string | undefined>, key: string): string | undefined {
  const value = raw[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function parsed<T>(schema: z.ZodType<T>, value: unknown, key: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new LegalConfigError(key, 'valeur invalide');
  return result.data;
}

/**
 * Validates the legal configuration. Missing identity values become the exact placeholder; a
 * non-empty but invalid value (for example a malformed contact e-mail) is refused by field name.
 */
export function parseLegalConfig(
  raw: Readonly<Record<string, string | undefined>> = {},
): LegalConfig {
  const identityRaw = {
    ...(readValue(raw, 'LEGAL_ENTITY_NAME') === undefined
      ? {}
      : { LEGAL_ENTITY_NAME: readValue(raw, 'LEGAL_ENTITY_NAME') }),
    ...(readValue(raw, 'LEGAL_ENTITY_ADDRESS') === undefined
      ? {}
      : { LEGAL_ENTITY_ADDRESS: readValue(raw, 'LEGAL_ENTITY_ADDRESS') }),
    ...(readValue(raw, 'LEGAL_CONTACT_EMAIL') === undefined
      ? {}
      : { LEGAL_CONTACT_EMAIL: readValue(raw, 'LEGAL_CONTACT_EMAIL') }),
    ...(readValue(raw, 'LEGAL_HOST_NAME') === undefined
      ? {}
      : { LEGAL_HOST_NAME: readValue(raw, 'LEGAL_HOST_NAME') }),
  };
  const identityValues = parsed(identitySchema, identityRaw, 'LEGAL_IDENTITY');

  const versionsRaw = {
    ...(readValue(raw, 'LEGAL_CGU_VERSION') === undefined
      ? {}
      : { LEGAL_CGU_VERSION: readValue(raw, 'LEGAL_CGU_VERSION') }),
    ...(readValue(raw, 'LEGAL_PRIVACY_VERSION') === undefined
      ? {}
      : { LEGAL_PRIVACY_VERSION: readValue(raw, 'LEGAL_PRIVACY_VERSION') }),
  };
  const versionValues = parsed(versionEntrySchema, versionsRaw, 'LEGAL_VERSION');

  const identity: LegalIdentity = {
    entityName: identityValues.LEGAL_ENTITY_NAME ?? LEGAL_PLACEHOLDER,
    entityAddress: identityValues.LEGAL_ENTITY_ADDRESS ?? LEGAL_PLACEHOLDER,
    contactEmail: identityValues.LEGAL_CONTACT_EMAIL ?? LEGAL_PLACEHOLDER,
    hostName: identityValues.LEGAL_HOST_NAME ?? LEGAL_PLACEHOLDER,
  };
  const versions: LegalVersions = {
    cgu: versionValues.LEGAL_CGU_VERSION ?? LEGAL_VERSIONS.cgu,
    privacy: versionValues.LEGAL_PRIVACY_VERSION ?? LEGAL_VERSIONS.privacy,
  };

  const missingIdentity = LEGAL_IDENTITY_KEYS.filter((key) => {
    const provided =
      key === 'LEGAL_ENTITY_NAME'
        ? identityValues.LEGAL_ENTITY_NAME
        : key === 'LEGAL_ENTITY_ADDRESS'
          ? identityValues.LEGAL_ENTITY_ADDRESS
          : key === 'LEGAL_CONTACT_EMAIL'
            ? identityValues.LEGAL_CONTACT_EMAIL
            : identityValues.LEGAL_HOST_NAME;
    return provided === undefined;
  });

  return {
    identity,
    versions,
    missingIdentity,
    complete: missingIdentity.length === 0,
  };
}

/** Reads the legal configuration from a process-like environment (server components, scripts). */
export function legalConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LegalConfig {
  return parseLegalConfig(env);
}

/** Active versions, without the identity: every acceptance comparison uses this source. */
export function activeLegalVersions(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LegalVersions {
  return legalConfigFromEnv(env).versions;
}

/** A version is accepted only when it is exactly the active one (BR-ACC-02, SPEC-806 ET-3). */
export function isCurrentVersion(submitted: string, active: string): boolean {
  return submitted === active;
}
