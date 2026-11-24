// Vitest [SPEC-3502] — configuration de production et publication (EF-3, EF-4 ; ET-3 ; CA-4, CA-5).
//
// Le test évalue `app.config.ts` **avec l'environnement d'un build de production** (aucune variable
// de démonstration) et confronte le résultat à `eas.json` et aux fiches de `store/` : identifiants
// définitifs, schéma, liens universels, permissions déclarées, manifeste de confidentialité, absence
// de tout réglage de test. Il ne contacte ni Apple, ni Google, ni EAS : ces comptes sont un blocage
// externe consigné dans `evidence/SPEC-3502/acceptance.md`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ExpoConfig } from 'expo/config';
import { beforeAll, describe, expect, it } from 'vitest';

import { PRIVACY_DATA_USES, REQUIRED_REASON_APIS } from '../../store/metadata';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '..', '..');

interface EasProfile {
  readonly distribution?: string;
  readonly channel?: string;
  readonly autoIncrement?: boolean;
  readonly android?: { readonly buildType?: string };
  readonly ios?: { readonly buildConfiguration?: string };
  readonly env?: Record<string, string>;
}

interface EasJson {
  readonly build: Record<string, EasProfile>;
  readonly submit: Record<string, { readonly android?: { readonly track?: string } }>;
}

function easJson(): EasJson {
  return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'eas.json'), 'utf8')) as EasJson;
}

function packageJson(): { dependencies?: Record<string, string> } {
  return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
}

let production: ExpoConfig;

beforeAll(async () => {
  // Environnement d'un build `production` : le profil de l'ADR-3004 § 8 ne pose aucune variable de
  // démonstration, l'horloge est celle du système et les URL publiques sont en HTTPS.
  process.env.EXPO_PUBLIC_API_URL = 'https://learny.exemple.fr';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://supabase.exemple.fr';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'production-anon-key';
  process.env.EXPO_PUBLIC_WEB_URL = 'https://learny.exemple.fr';
  process.env.EXPO_PUBLIC_ENABLE_SDD_PAGES = '0';
  delete process.env.EXPO_PUBLIC_CLOCK_FIXED_AT;
  delete process.env.LEARNY_E2E_CLEARTEXT;

  const module = await import('../../app.config');
  production = module.default({ config: {} } as unknown as Parameters<typeof module.default>[0]);
});

describe('[SPEC-3502] configuration de production', () => {
  it('déclare les identifiants définitifs des deux plateformes', () => {
    expect(production.name).toBe('Learny');
    expect(production.slug).toBe('learny');
    expect(production.version).toBe('1.0.0');
    expect(production.scheme).toBe('learny');
    expect(production.ios?.bundleIdentifier).toBe('fr.learny.app');
    expect(production.android?.package).toBe('fr.learny.app');
    // La version de runtime suit l'empreinte native : un update ne peut pas atterrir sur un binaire
    // incompatible (ADR-3004 § 8, EF-3).
    expect(production.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('déclare les liens universels de l’application web', () => {
    expect(production.ios?.associatedDomains).toEqual(['applinks:learny.exemple.fr']);
    const filters = production.android?.intentFilters ?? [];
    expect(filters).toHaveLength(1);
    expect(filters[0]?.autoVerify).toBe(true);
    const data = (filters[0]?.data ?? []) as unknown as readonly (
      | string
      | { readonly pathPrefix?: string }
    )[];
    const paths = data.map((entry) => (typeof entry === 'string' ? entry : (entry.pathPrefix ?? '')));
    expect(paths).toEqual(['/auth/mobile', '/api/v1/auth/callback']);
  });

  it('ne pose aucun réglage de test dans la configuration de production', () => {
    expect(production.extra?.enableSddPages).toBe(false);
    // Le profil `e2e` les pose, la production non : la comparaison explicite documente l'écart.
    const e2e = easJson().build.e2e;
    expect(e2e?.env?.EXPO_PUBLIC_ENABLE_SDD_PAGES).toBe('1');
    expect(e2e?.env?.EXPO_PUBLIC_CLOCK_FIXED_AT).toBe('2026-11-11T12:20:00Z');
    const prod = easJson().build.production;
    expect(prod?.env?.EXPO_PUBLIC_ENABLE_SDD_PAGES).toBe('0');
    for (const key of Object.keys(prod?.env ?? {})) {
      expect(key).not.toContain('CLOCK_FIXED');
      expect(key).not.toContain('SDD_');
    }
    const plugins = JSON.stringify(production.plugins ?? []);
    expect(plugins).not.toContain('e2e-cleartext');
    expect(plugins).toContain('expo-notifications');
  });

  it('déclare les permissions Android réellement utilisées, sans permission intrusive', () => {
    const permissions = production.android?.permissions ?? [];
    expect(permissions).toContain('android.permission.INTERNET');
    expect(permissions).toContain('android.permission.POST_NOTIFICATIONS');
    expect(permissions).toContain('android.permission.VIBRATE');
    // Une permission non utilisée est un motif de refus ou de questionnaire supplémentaire.
    const forbidden = ['CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS'];
    for (const permission of permissions) {
      for (const word of forbidden) expect(permission).not.toContain(word);
    }
  });

  it('publie un manifeste de confidentialité iOS complet, sans suivi (ET-3)', () => {
    const manifests = production.ios?.privacyManifests;
    expect(manifests).toBeDefined();
    expect(manifests?.NSPrivacyTracking).toBe(false);
    expect(manifests?.NSPrivacyTrackingDomains).toEqual([]);

    // Les API à raison requise sont celles de `store/metadata.ts`, à l'identique.
    const declared = (manifests?.NSPrivacyAccessedAPITypes ?? []).map((api) => ({
      category: api.NSPrivacyAccessedAPIType,
      reasons: api.NSPrivacyAccessedAPITypeReasons,
    }));
    expect(declared).toHaveLength(REQUIRED_REASON_APIS.length);
    for (const api of REQUIRED_REASON_APIS) {
      const match = declared.find((entry) => entry.category === api.category);
      expect(match, `${api.category} absent du manifeste`).toBeDefined();
      expect(match?.reasons).toEqual([api.reason]);
    }

    // Les données collectées décrivent exactement les données réellement traitées.
    const collected = manifests?.NSPrivacyCollectedDataTypes ?? [];
    const realUses = PRIVACY_DATA_USES.filter((use) => !use.data.startsWith('Aucune'));
    expect(collected).toHaveLength(realUses.length);
    for (const entry of collected) {
      expect(entry.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(entry.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(entry.NSPrivacyCollectedDataTypePurposes).toEqual([
        'NSPrivacyCollectedDataTypePurposeAppFunctionality',
      ]);
    }
    // Déclaration de chiffrement : HTTPS et Keychain seulement, aucune question bloquante en revue.
    expect(production.ios?.infoPlist?.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(production.ios?.infoPlist?.NSUserTrackingUsageDescription).toBeUndefined();
  });
});

describe('[SPEC-3502] profils de publication EAS', () => {
  it('produit un AAB Android et une IPA iOS signés depuis le profil production', () => {
    const prod = easJson().build.production;
    expect(prod).toBeDefined();
    expect(prod?.distribution).toBe('store');
    expect(prod?.android?.buildType).toBe('app-bundle');
    expect(prod?.ios?.buildConfiguration).toBe('Release');
    // Les numéros de build sont gérés par EAS (`appVersionSource: remote`).
    expect(prod?.autoIncrement).toBe(true);
    const cli = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'eas.json'), 'utf8')) as {
      cli?: { appVersionSource?: string };
    };
    expect(cli.cli?.appVersionSource).toBe('remote');
  });

  it('déclare le canal EAS Update « production » sans update publié', () => {
    expect(easJson().build.production?.channel).toBe('production');
    expect(easJson().build.preview?.channel).toBe('preview');
    expect(easJson().build.development?.channel).toBe('development');
    // Aucun client d'update dans le binaire V1 : le canal reste vide, aucun update ne peut être
    // publié ni téléchargé (EF-3). L'ajout d'`expo-updates` exigerait un ADR (ADR-3004).
    expect(packageJson().dependencies?.['expo-updates']).toBeUndefined();
  });

  it('prépare la soumission en test interne Google Play', () => {
    const submit = easJson().submit.production;
    expect(submit).toBeDefined();
    expect(submit?.android?.track).toBe('internal');
  });
});
