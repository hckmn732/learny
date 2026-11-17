import { describe, expect, it } from 'vitest';

import {
  LEGAL_PLACEHOLDER,
  LegalConfigError,
  activeLegalVersions,
  isCurrentVersion,
  legalConfigFromEnv,
  parseLegalConfig,
} from './legal';
import { LEGAL_VERSIONS } from './product';

const COMPLETE = {
  LEGAL_ENTITY_NAME: 'Learny Éditions SAS',
  LEGAL_ENTITY_ADDRESS: '12 rue des Écoles, 75005 Paris',
  LEGAL_CONTACT_EMAIL: 'bonjour@learny.test',
  LEGAL_HOST_NAME: 'Supabase et Vercel',
  LEGAL_CGU_VERSION: '2026-11-11',
  LEGAL_PRIVACY_VERSION: '2026-11-11',
} as const;

describe('[SPEC-806] legal configuration', () => {
  it('CA-4 — une identité absente affiche exactement le marqueur, sans valeur inventée', () => {
    const config = parseLegalConfig({});
    expect(config.identity).toEqual({
      entityName: LEGAL_PLACEHOLDER,
      entityAddress: LEGAL_PLACEHOLDER,
      contactEmail: LEGAL_PLACEHOLDER,
      hostName: LEGAL_PLACEHOLDER,
    });
    expect(config.missingIdentity).toEqual([
      'LEGAL_ENTITY_NAME',
      'LEGAL_ENTITY_ADDRESS',
      'LEGAL_CONTACT_EMAIL',
      'LEGAL_HOST_NAME',
    ]);
    expect(config.complete).toBe(false);
    expect(config.versions).toEqual(LEGAL_VERSIONS);
  });

  it('CA-1 — les quatre valeurs fournies et les versions non vides sont exportées', () => {
    const config = parseLegalConfig(COMPLETE);
    expect(config.identity).toEqual({
      entityName: 'Learny Éditions SAS',
      entityAddress: '12 rue des Écoles, 75005 Paris',
      contactEmail: 'bonjour@learny.test',
      hostName: 'Supabase et Vercel',
    });
    expect(config.missingIdentity).toEqual([]);
    expect(config.complete).toBe(true);
    expect(config.versions).toEqual({ cgu: '2026-11-11', privacy: '2026-11-11' });
  });

  it('CA-4 — un champ vide ou blanc est traité comme absent, les versions retombent sur le défaut', () => {
    const config = parseLegalConfig({
      ...COMPLETE,
      LEGAL_ENTITY_NAME: '   ',
      LEGAL_CGU_VERSION: '',
      LEGAL_PRIVACY_VERSION: '  ',
    });
    expect(config.identity.entityName).toBe(LEGAL_PLACEHOLDER);
    expect(config.missingIdentity).toEqual(['LEGAL_ENTITY_NAME']);
    expect(config.versions).toEqual(LEGAL_VERSIONS);
  });

  it('CA-4 — une valeur non vide mais invalide est refusée par nom de champ, sans la divulguer', () => {
    expect(() => parseLegalConfig({ ...COMPLETE, LEGAL_CONTACT_EMAIL: 'pas-un-email' })).toThrow(
      LegalConfigError,
    );
    try {
      parseLegalConfig({ ...COMPLETE, LEGAL_CONTACT_EMAIL: 'secret-value' });
    } catch (error) {
      expect(error).toBeInstanceOf(LegalConfigError);
      expect((error as LegalConfigError).field).toBe('LEGAL_IDENTITY');
      expect((error as Error).message).not.toContain('secret-value');
    }
    expect(() => parseLegalConfig({ ...COMPLETE, LEGAL_CGU_VERSION: 'v'.repeat(41) })).toThrow(
      'LEGAL_VERSION',
    );
    expect(() => parseLegalConfig({ ...COMPLETE, LEGAL_ENTITY_ADDRESS: 'a'.repeat(401) })).toThrow(
      'LEGAL_IDENTITY',
    );
  });

  it('CA-3 — les versions actives viennent de l’environnement et la comparaison est stricte', () => {
    const versions = activeLegalVersions({
      LEGAL_CGU_VERSION: '2027-01-01',
      LEGAL_PRIVACY_VERSION: '2027-02-02',
    });
    expect(versions).toEqual({ cgu: '2027-01-01', privacy: '2027-02-02' });
    expect(isCurrentVersion('2027-01-01', versions.cgu)).toBe(true);
    expect(isCurrentVersion('2026-11-11', versions.cgu)).toBe(false);
    expect(legalConfigFromEnv(COMPLETE).complete).toBe(true);
  });
});
