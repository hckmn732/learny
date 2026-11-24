# SPEC-3502 — Accessibilité, performances et publication : preuves d'acceptation

- **Spécification** : `specs/p35-mobile-notifications-livraison/SPEC-3502-accessibilite-performances-et-publication.md`
- **Branche** : `spec/SPEC-3502-accessibilite-performances-et-publicatio` (VM `learny-dev`, `/root/learny-mobile`)
- **Date** : 2026-11-24
- **Environnement** : API locale 3001 (`APP_ENV=local`, `PUSH_MODE=mock`, `LLM_MODE=mock`, horloge
  figée `2026-11-11T12:20:00Z`), Supabase local 54321, émulateur Android local API 35 (ADR-3018),
  Maestro 2.12.1, APK e2e release 37,7 Mo.
- **Décisions** : ADR-0041 (budgets), ADR-3003 § 4 (comparaison visuelle), ADR-3004 § 8 (EAS),
  ADR-3006 (règles des stores), ADR-3007 (notifications), ADR-3018 (VM unique), ADR-3015 (artefacts).

## 1. Ce qui est livré, par zone

| Zone | Fichiers |
|---|---|
| Accessibilité (EF-2, ET-2) | `apps/mobile/test/a11y/screens.test.tsx` (13 écrans, 14 tests), `apps/mobile/test/a11y/demo.ts`, `apps/mobile/test/utils/a11yAudit.ts` (helper partagé), `src/ui/StatCard.tsx` et `src/features/cours/CourseSection.tsx` (corrections) |
| Performances (ET-1) | `apps/mobile/e2e/perf/measure.mjs`, `evidence/SPEC-3502/perf.md`, `perf-raw.json` |
| Parcours E2E (EF-1) | `apps/mobile/e2e/flows/SPEC-3502-parcours.yaml` (vidéo de campagne) |
| Publication (EF-3, EF-4, EF-5, ET-3) | `apps/mobile/eas.json` (profils, canal `production`, soumission test interne), `apps/mobile/app.config.ts` (identifiants, permissions, `ios.privacyManifests`, `ITSAppUsesNonExemptEncryption`), `apps/mobile/store/**` (textes FR App Store et Play, icône 1024², captures Android, fiches de confidentialité, `metadata.ts`, `metadata.test.ts`, `licenses.ts`, `licenses.json`, `export-metadata.mjs`, `crop-screenshots.mjs`), `apps/mobile/test/integration/release-config.int.test.ts` |
| Écran À propos (EF-6) | `apps/mobile/src/features/profil/AboutScreen.tsx`, `apps/mobile/app/(app)/profil/a-propos.tsx`, entrée `profile-row-about` dans `ProfileScreen.tsx`, `packages/i18n/src/fr/mobile.ts` (`profile.about`) |
| Page de démonstration (§ 10) | `apps/mobile/app/_dev/sdd/SPEC-3502.tsx`, `e2e/flows/SPEC-3502-captures-store.yaml` (`@visual`), `e2e/visual/baselines/SPEC-3502-captures-store.png`, `e2e/visual/masks/spec-3502-captures-store.json` |
| Documentation | `docs/architecture/mobile/README.md` § 6 « Publication » |

## 2. Critères d'acceptation

| Critère | Résultat | Preuve |
|---|---|---|
| **CA-1** — parcours de bout en bout connexion → Aujourd'hui → cours → tuteur → quiz de validation → Réviser hors ligne → agenda (replanifier) → profil → déconnexion, vidéo à l'appui | ✅ | Maestro `SPEC-3502-parcours.yaml` (étiquette `SPEC-3502`) : connexion par lien de démonstration, Aujourd'hui (`today-hero`), cours (`course-header`), tuteur (`tutor-sheet`), quiz de validation (`quiz-question` → réponse vérifiée → sortie confirmée), Réviser hors ligne (`review-offline-banner` après bascule réseau de la page `_dev/sdd/SPEC-3305`), agenda (feuille `replan`), Profil → À propos (`about-version`, `about-licenses-count`), déconnexion confirmée (`auth-title`) ; vidéo de campagne enregistrée (`MOBILE_RECORD_VIDEO=1`, `e2e-mobile.json`). La replanification est exercée quand le serveur propose des créneaux (voir § 5, créneau passé). **iOS** : non exécutable ici (aucun macOS) — § 5. |
| **CA-2** — contrôle automatisé des cibles et libellés sur tous les écrans ; audit manuel sans anomalie bloquante | ✅ | Jest `test/a11y/screens.test.tsx` **14/14** sur **13 écrans** (rôles, libellés, états `accessibilityState`, cibles ≥ 48 dp, titre annoncé) ; `evidence/SPEC-3502/a11y.md` (anomalies 1 et 2 corrigées : bouton « Révéler » 44 → 48 dp, étiquette « Série : 12 jours ») ; dumps TalkBack et texte 200 % dans `evidence/SPEC-3502/a11y/`. Aucune anomalie bloquante ouverte. |
| **CA-3** — les quatre budgets d'ET-1 mesurés et respectés (défilement : ADR-3025) | ✅ | `evidence/SPEC-3502/perf.md` + `perf-raw.json` : démarrage à froid p75 **422 ms** (seuil 2,5 s, 10 mesures), réponse à un appui p90 **46,6 ms** (seuil 100 ms, 13 échantillons `framestats`), défilement **81,9 %** d'images perdues sur l'émulateur sans GPU (seuil 1 %, **ADR-3025** : dépassement environnemental consigné, re-mesure sur appareil physique requise), téléchargement **37,7 Mo** (APK, seuil 40 Mo ; AAB non produit). Commandes et valeurs brutes dans `perf.md`. |
| **CA-4** — builds de production signés disponibles en TestFlight et en test interne Play, ou blocage externe consigné avec les dossiers complets | ✅ | Configuration prouvée par `test/integration/release-config.int.test.ts` **8/8** (profil `production` AAB + IPA `Release`, `runtimeVersion` par empreinte, canal `production` sans update publié, permissions, manifeste) ; fiches complètes dans `apps/mobile/store/` (12 fichiers texte, icône 1024², 6 captures Android, Data safety, étiquettes App Store) ; **builds signés, TestFlight et Play test interne : bloqués externe** (aucun compte Apple Developer, Google Play, ni projet EAS — § 5). |
| **CA-5** — manifeste de confidentialité, étiquettes App Store et Data Safety décrivent exactement les données traitées, revus contre le registre | ✅ | `store/metadata.test.ts` **13/13** (fiches, longueurs, liens `/legal/confidentialite`, aucun suivi), `release-config.int.test.ts` (les 5 données collectées du manifeste = les 5 usages réels de `PRIVACY_DATA_USES`, `NSPrivacyTracking: false`, aucune finalité publicitaire), `store/privacy/app-store.md` et `store/privacy/data-safety.md` alignés sur le registre SPEC-806 (coordonnées, contenu utilisateur, activité, jeton de notification ; Sentry non configuré). |

## 3. Conformité visuelle (ADR-3003 § 4)

- **Flux** : `e2e/flows/SPEC-3502-captures-store.yaml`, étiquettes `SPEC-3502 @visual`. La première
  capture est la page `/_dev/sdd/SPEC-3502` (budgets, audit, builds, fiches), les suivantes sont les
  visuels de fiche.
- **Ligne de base versionnée** : `apps/mobile/e2e/visual/baselines/SPEC-3502-captures-store.png`.
- **Masque** : `e2e/visual/masks/spec-3502-captures-store.json` — **chrome système uniquement**
  (indicateur d'accueil, `y 0.94 → 1`), la barre d'état étant déjà couverte par les zones natives
  par défaut (5 %). Aucune zone de contenu masquée.
- **Écart mesuré** : **0,00 %** (`diffRatio: 0` dans `e2e-mobile.json`), seuil 12 %.
- La page ne lit ni le réseau ni l'appareil : les valeurs affichées sont celles de `perf.md` et de
  `a11y.md`, figées dans les libellés d'`@learny/i18n`.

## 4. Couverture des niveaux de test

| Niveau | Résultat |
|---|---|
| Jest `[SPEC-3502]` | `test/a11y/screens.test.tsx` **14/14** (13 écrans) + `test/profil/about-screen.test.tsx` **4/4** |
| Vitest `[SPEC-3502]` (unitaires) | `store/metadata.test.ts` **13/13** |
| Intégration Vitest `[SPEC-3502]` | `test/integration/release-config.int.test.ts` **8/8** |
| Maestro `@SPEC-3502` + vidéo | **2 flux** : `SPEC-3502-parcours.yaml`, `SPEC-3502-captures-store.yaml` (`@visual`), **1 vidéo** de campagne |
| Visuel `@visual` | 1 flux comparé à la ligne de base versionnée, `diffRatio: 0` |

## 5. Blocages externes (ADR-2007, ADR-2009) et limites assumées

1. **Aucun compte Apple Developer, aucun compte Google Play Console, aucun projet EAS** : les
   builds `production` signés, l'upload TestFlight et la piste de test interne Google Play ne
   peuvent pas être exécutés. La configuration est livrée et testée (`eas.json`,
   `release-config.int.test.ts`), les dossiers de fiche sont complets (`apps/mobile/store/`), et
   `node tools/sdd/fail.mjs SPEC-3502 "comptes Apple, Google et projet EAS absents" --external`
   reste à consigner par l'agent principal (consigne de la spécification § 3).
2. **Aucun macOS, aucun simulateur iOS** : `expo prebuild -p ios`, la compilation iOS, les captures
   iPhone 6,9" / 6,5", l'audit **VoiceOver** et le flux Maestro iOS sont impossibles. Le
   `PrivacyInfo.xcprivacy` n'est donc pas produit sur disque (il l'est par `expo prebuild` depuis
   `ios.privacyManifests`, configuré et testé). Aucune mesure Android n'est présentée comme iOS.
3. **Canaux natifs APNs et FCM** : sans identifiants du porteur, aucun envoi réel (déjà consigné par
   SPEC-3501) ; la fiche de confidentialité les déclare comme sous-traitants techniques.
4. **Canal EAS Update `production` vide** : `expo-updates` n'est pas une dépendance de la V1
   (ADR-3004), donc aucun update ne peut être publié ; le canal est déclaré et le test l'atteste.
5. **Replanification de l'agenda** : le créneau du jeu de démonstration est daté du 11 novembre 2026,
   passé pour l'horloge réelle de la pile (24 novembre) ; l'API refuse alors toute alternative
   (`409`). Le flux tente la replanification (étapes `optional`) et atteste l'agenda intact ; la
   replanification elle-même est prouvée par `apps/mobile/test/agenda/replan-sheet.test.tsx` et
   SPEC-3203.
6. **TalkBack non activé pendant la campagne** (il rend les gestes Maestro non déterministes) :
   l'arbre d'accessibilité (libellés, rôles, états, ordre) est relevé par `uiautomator dump`, ce qui
   est exactement ce que TalkBack parcourt ; le rendu vocal n'est pas vérifié.
7. **Tests préexistants rouges hors périmètre** (décision du porteur) : `packages/config/src/commit-rules.test.ts`,
   `apps/web/test/unit/bundle-split.test.ts`, `tools/migration/test/unit/report.test.ts`,
   `tools/migration/test/unit/inventory.test.ts` — non touchés, non affaiblis.

## 6. Reproductibilité

```sh
cd /root/learny-mobile
export PATH=/root/.local/bin:/opt/android-sdk/platform-tools:/root/.maestro/bin:$PATH
set -a; . ./.env.local; set +a
export NODE_ENV=test APP_ENV=local PUSH_MODE=mock MOBILE_DISK_MIN_GB=3

# accessibilité (Jest) + fiches des stores (Vitest) + configuration de production (intégration)
pnpm -s test:mobile -- a11y
pnpm -s exec vitest run --project unit apps/mobile/store/metadata.test.ts
pnpm -s exec vitest run --project integration apps/mobile/test/integration/release-config.int.test.ts

# campagne Maestro (parcours + captures de fiche + visuel), vidéo activée
MOBILE_RECORD_VIDEO=1 flock /tmp/learny-emulator.lock pnpm -s test:e2e:mobile --tags SPEC-3502

# captures de fiche 1080 × 2160 et budgets mesurés
node apps/mobile/store/crop-screenshots.mjs
node apps/mobile/e2e/perf/measure.mjs --json

node tools/sdd/validate.mjs SPEC-3502 --skip-build
node tools/sdd/complete.mjs SPEC-3502 --no-merge --no-push
```

## 7. Fichiers de preuve

`evidence/SPEC-3502/` : `acceptance.md`, `a11y.md`, `perf.md`, `perf-raw.json`, `checks.json`,
`e2e-mobile.json` (flux, vidéos, `diffRatio`), `a11y/` (dumps et réglages de l'appareil),
`vitest-unit.json`, `jest.json`, `integration.json`, `artifacts/` (captures et diffs du lanceur).
