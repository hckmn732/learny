// Vitest [SPEC-3502] — fiches des stores, manifeste de confidentialité et licences (EF-4, EF-6,
// ET-3 ; CA-2, CA-5 ; BR-PLA-04, BR-PLA-05, ADR-3006).
//
// Un seul test par règle, pour que l'échec nomme la règle : longueurs des plateformes, champs
// obligatoires, liens légaux, exactitude de la fiche de confidentialité contre le registre, artefacts
// texte identiques à `store/metadata.ts`, icône et captures aux formats requis, licences à jour.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { storeFiles } from './export-fields';
import { serializeLicenses } from './licenses';
import {
  AGE_RATING,
  APP_STORE,
  CATEGORY,
  LIMITS,
  PLAY,
  PRIVACY_DATA_USES,
  PRIVACY_PATH,
  PUBLIC_WEB_URL,
  REQUIRED_REASON_APIS,
  withinLimit,
} from './metadata';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.dirname(HERE);

/** Largeur et hauteur d'un PNG, lues dans son en-tête IHDR (aucune dépendance). */
function pngSize(file: string): { width: number; height: number } {
  const buffer = fs.readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Chaînes interdites dans une fiche : valeurs locales, secrets ou texte de remplissage. */
const FORBIDDEN = ['localhost', '127.0.0.1', '10.0.2.2', 'EXPO_PUBLIC', 'TODO', 'lorem ipsum'];

describe('[SPEC-3502] fiches des stores', () => {
  it("respecte les longueurs de l'App Store", () => {
    expect(withinLimit(APP_STORE.name, LIMITS.appStore.name)).toBe(true);
    expect(withinLimit(APP_STORE.subtitle, LIMITS.appStore.subtitle)).toBe(true);
    expect(withinLimit(APP_STORE.promotionalText, LIMITS.appStore.promotionalText)).toBe(true);
    expect(withinLimit(APP_STORE.description, LIMITS.appStore.description)).toBe(true);
    expect(withinLimit(APP_STORE.keywords, LIMITS.appStore.keywords)).toBe(true);
    // Une fiche vide ou squelettique est refusée par la revue : la description porte le produit.
    expect([...APP_STORE.description].length).toBeGreaterThanOrEqual(500);
  });

  it('respecte les longueurs de Google Play', () => {
    expect(withinLimit(PLAY.title, LIMITS.play.title)).toBe(true);
    expect(withinLimit(PLAY.shortDescription, LIMITS.play.shortDescription)).toBe(true);
    expect(withinLimit(PLAY.fullDescription, LIMITS.play.fullDescription)).toBe(true);
    expect([...PLAY.fullDescription].length).toBeGreaterThanOrEqual(500);
  });

  it('ne contient aucune valeur locale, de test ou de remplissage', () => {
    const texts = [
      APP_STORE.name,
      APP_STORE.subtitle,
      APP_STORE.promotionalText,
      APP_STORE.description,
      APP_STORE.keywords,
      PLAY.title,
      PLAY.shortDescription,
      PLAY.fullDescription,
    ];
    for (const text of texts) {
      const lower = text.toLowerCase();
      for (const forbidden of FORBIDDEN) expect(lower).not.toContain(forbidden.toLowerCase());
    }
  });

  it('publie les liens légaux et de support en HTTPS, identiques dans les deux stores', () => {
    const privacy = `${PUBLIC_WEB_URL}${PRIVACY_PATH}`;
    expect(APP_STORE.privacyUrl).toBe(privacy);
    expect(PLAY.privacyUrl).toBe(privacy);
    for (const url of [
      APP_STORE.privacyUrl,
      APP_STORE.supportUrl,
      APP_STORE.marketingUrl,
      PLAY.privacyUrl,
    ]) {
      expect(url.startsWith('https://')).toBe(true);
      expect(() => new URL(url)).not.toThrow();
    }
    // C'est la page légale du web (SPEC-806) : le chemin est normatif, pas un texte libre.
    expect(new URL(APP_STORE.privacyUrl).pathname).toBe('/legal/confidentialite');
  });

  it('déclare la catégorie Éducation et une classification d’âge non vide', () => {
    expect(CATEGORY).toBe('Éducation');
    expect(AGE_RATING.appStore).toMatch(/^\d+\+$/);
    expect(AGE_RATING.play.length).toBeGreaterThan(0);
  });

  it('décrit la suppression du compte dans l’application (BR-PLA-05, ADR-3006)', () => {
    expect(APP_STORE.description).toMatch(/suppression du compte/u);
    expect(PLAY.fullDescription).toMatch(/suppression du compte/u);
  });

  it('projette des fichiers identiques à la source versionnée', () => {
    const files = storeFiles();
    expect(files).toHaveLength(12);
    for (const file of files) {
      const target = path.join(HERE, file.path);
      expect(fs.existsSync(target), `${file.path} absent`).toBe(true);
      expect(fs.readFileSync(target, 'utf8'), `${file.path} désynchronisé`).toBe(file.content);
    }
  });
});

describe('[SPEC-3502] confidentialité des stores', () => {
  it('ne déclare aucun suivi publicitaire (ET-3, ET-4, BR-PLA-04)', () => {
    expect(PRIVACY_DATA_USES.length).toBeGreaterThanOrEqual(5);
    for (const use of PRIVACY_DATA_USES) expect(use.usedForTracking).toBe(false);
    const categories = PRIVACY_DATA_USES.map((use) => use.category);
    expect(categories).toContain('Coordonnées');
    expect(categories).toContain('Contenu utilisateur');
    expect(categories).toContain('Activité');
  });

  it('limite les tiers aux sous-traitants techniques du registre (BR-PLA-04)', () => {
    const allowed = [
      'Supabase (hébergement UE)',
      'Apple (APNs)',
      'Google (FCM)',
      'Fournisseur de modèle d’IA choisi par l’apprenant',
    ];
    for (const use of PRIVACY_DATA_USES) {
      for (const third of use.thirdParty) expect(allowed).toContain(third);
    }
    // Aucune donnée laissée sans finalité : le formulaire Data safety refuse un champ vide.
    for (const use of PRIVACY_DATA_USES) {
      expect(use.purpose.length).toBeGreaterThan(10);
      expect(use.data.length).toBeGreaterThan(2);
    }
  });

  it('déclare exactement les API à raison requise du manifeste iOS (ET-3)', () => {
    expect(REQUIRED_REASON_APIS.length).toBeGreaterThanOrEqual(3);
    for (const api of REQUIRED_REASON_APIS) {
      expect(api.category.startsWith('NSPrivacyAccessedAPICategory')).toBe(true);
      expect(api.reason).toMatch(/^[A-Z0-9]{4}\.1$/);
      expect(api.why.length).toBeGreaterThan(20);
    }
    const categories = REQUIRED_REASON_APIS.map((api) => api.category);
    expect(new Set(categories).size).toBe(categories.length);
  });
});

describe('[SPEC-3502] ressources de publication', () => {
  it('fournit une icône 1024 × 1024 pour les deux stores', () => {
    const icon = path.join(HERE, 'assets', 'icon-1024.png');
    expect(fs.existsSync(icon), 'store/assets/icon-1024.png absent').toBe(true);
    expect(pngSize(icon)).toEqual({ width: 1024, height: 1024 });
  });

  it('fournit des captures Android au format Google Play (ratio ≤ 2:1)', () => {
    const dir = path.join(HERE, 'screenshots', 'android-phone');
    expect(fs.existsSync(dir), 'store/screenshots/android-phone absent').toBe(true);
    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.png')).sort();
    // Play exige au moins 2 captures pour une fiche téléphone.
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      const size = pngSize(path.join(dir, file));
      expect(size.width).toBeGreaterThanOrEqual(320);
      expect(size.width).toBeLessThanOrEqual(3840);
      expect(size.width / size.height).toBeCloseTo(0.5, 2);
    }
  });

  it('garde le fichier de licences des polices et bibliothèques à jour (EF-6)', () => {
    const target = path.join(HERE, 'licenses.json');
    expect(fs.existsSync(target), 'store/licenses.json absent').toBe(true);
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8')) as {
      fonts: { name: string; license: string }[];
      packages: { name: string; license: string }[];
    };
    expect(parsed.fonts.length).toBeGreaterThanOrEqual(2);
    expect(parsed.packages.length).toBeGreaterThanOrEqual(20);
    for (const font of parsed.fonts) expect(font.license).toBe('SIL Open Font License 1.1');
    // Le fichier est généré : une montée de version le rend périmé, et ce test le dit.
    expect(fs.readFileSync(target, 'utf8')).toBe(serializeLicenses(APP_DIR));
  });
});
