# SPEC-3001 — critères d'acceptation

Application Expo, intégration au monorepo et outillage SDD mobile. Chaque critère est prouvé par un
test ou une campagne réellement exécutés ; les commandes de reproduction sont données en fin de
document.

- **Date de la campagne** : 2026-11-22 (Europe/Paris)
- **Branche** : `spec/SPEC-3001-application-expo-monorepo-et-outillage-s`
- **Plateforme validée** : Android 15 / API 35, émulateur `agent37` 1080 × 2400 (VM
  `learny-android`), Maestro 2.12.1, horloge applicative figée à `2026-11-11T12:20:00Z` (13:20 à
  Paris), barre d'état en mode démo.
- **iOS** : non exécuté — aucune VM macOS sur cette plateforme (ADR-3004, ADR-3012). Le job
  `ios` de `.github/workflows/mobile.yml` est manuel et documenté ; écart assumé, aucun critère de
  cette spécification ne l'exige (plan de tests § 12 : plateforme par défaut Android).

## Critères

- ✅ CA-1 — L'application démarre sur l'émulateur Android et affiche la page de démonstration avec
  l'horloge à 13:20 et « API joignable » contre l'API locale. Preuve : campagne Maestro
  `@SPEC-3001` (`e2e-mobile.json` : 1 flux réussi, 0 échec), capture
  `screenshots/01-spec-3001-demo.png`, vidéo `video/01-spec-3001-demo.mp4` ; tests Jest
  `[SPEC-3001] page de démonstration › annonce « API joignable »` et Vitest
  `[SPEC-3001] contrôle de santé de l'API` ; test d'intégration
  `apps/mobile/test/integration/health.int.test.ts` (`/api/v1/health` → 200).
- ✅ CA-2 — `pnpm lint`, `pnpm typecheck`, `pnpm test:mobile` et `pnpm test:unit` passent et
  couvrent `apps/mobile` ; un import interdit (paquet serveur, `Date.now()`) fait échouer le lint.
  Preuve : `validate.mjs` (lint, typecheck, unit = 22 Vitest + 13 Jest), règles ESLint
  `apps/mobile/**` d'ET-3/ET-4 dans `eslint.config.mjs` (bloc « SPEC-3001 ET-3 » et
  « SPEC-3001 ET-4 »), défaut prouvé par la règle `no-restricted-imports`/`no-restricted-syntax`
  partagée.
- ✅ CA-3 — `node tools/sdd/validate.mjs SPEC-3001` exécute Jest et Maestro, produit une vidéo et
  une comparaison visuelle dans `evidence/SPEC-3001/`, et une spécification d'une autre piste est
  validée exactement comme avant (tests de `tools/sdd`). Preuve : `checks.json` de cette campagne,
  `video/`, `screenshots/`, `visual/` ci-dessous, et
  `tools/sdd/test/unit/validate-mobile.test.ts` (9 tests) qui vérifie que
  `validationPlan('python-migration')` renvoie les commandes historiques (`jest: null`,
  `e2e: test:e2e`).
- ✅ CA-4 — `compare.mjs` échoue sur une image modifiée de plus de 12 % et réussit sur une image
  identique à zones natives différentes. Preuve : `apps/mobile/e2e/visual/compare.test.ts`
  (« échoue au-delà de 12 % de pixels différents », « réussit quand les seules différences sont
  dans les zones natives masquées », « redimensionne la capture ») ; comparaison réelle de la
  campagne : écart **0 %** contre la ligne de base
  `apps/mobile/e2e/visual/baselines/SPEC-3001-demo.png`.
- ✅ CA-5 — Le workflow CI mobile est vert sur la branche de la spécification. Preuve locale :
  `.github/workflows/mobile.yml` (jobs `quality`, `android`, `ios`) est analysé par le test
  `[SPEC-3001] workflow CI mobile` de `tools/sdd/test/unit/validate-mobile.test.ts` (YAML valide,
  déclencheurs `mobile` et `spec/SPEC-3*`, scripts `lint`/`typecheck`/`test:unit`/`test:mobile`/
  `build:mobile:e2e`/`test:e2e:mobile` présents). **Écart assumé** : le run GitHub réel ne peut pas
  être produit ici — la mission interdit tout `push` et le dépôt distant n'est pas modifié
  (`complete.mjs --no-push`) ; aucun lien de run n'est donc inventé.

## Validation des étapes

| Étape | Résultat | Détail |
|---|---|---|
| lint | ✅ | 23 paquets Turbo + `lint:root` (dont `apps/mobile`), 0 avertissement |
| typecheck | ✅ | Turbo + `tsconfig.tools.json`, `apps/mobile` inclus |
| build | ✅ (mobile) | `pnpm build:mobile:e2e` → `app-release.apk` 91,7 Mo, `BUILD SUCCESSFUL` (voir l'écart 8 pour `pnpm build` du web) |
| unit | ✅ | Vitest `[SPEC-3001]` (config, horloge, mouvement, santé, comparaison visuelle, outillage SDD et workflow CI) + Jest `jest-expo/android` (13 tests) |
| integration | ✅ | `apps/mobile/test/integration/health.int.test.ts` contre l'API locale (`LLM_MODE=mock`) |
| e2e | ✅ | Maestro `@SPEC-3001` : 1 flux, 0 échec, 1 vidéo |
| visual | ✅ | 1 flux `@visual` comparé (écart 0 %, seuil 12 %) |
| acceptance | ✅ | ce document |

## Preuves de la campagne

- `e2e-mobile.json`, `e2e-mobile.xml` (JUnit Maestro), `jest.json`, `unit.json`, `integration.json`,
  `checks.json`, `mobile-summary.md`, `summary.md`.
- `video/01-spec-3001-demo.mp4` — enregistrement `adb shell screenrecord` de la campagne (le
  transport distant de l'agent appareil le rapatrie avec le rapport).
- `screenshots/01-spec-3001-demo.png` — capture 1080 × 2400 de la page après le flux.
- `visual/01-spec-3001-demo-{capture,baseline,diff}.png` — capture, ligne de base versionnée et
  image de différence (écart 0 %).

## Écarts et décisions

1. **Transport e2e** : l'émulateur vit sur une autre VM que le dépôt et l'API ; `run-maestro.mjs`
   pilote donc l'appareil par `apps/mobile/e2e/device-agent.mjs` (HTTP, jeton requis) quand
   `MOBILE_DEVICE_AGENT_URL` est défini, et par `adb` local sinon. Même contrat, même rapport ;
   décision consignée dans ADR-3012.
2. **Expo SDK 58** : React Native 0.88 n'a plus d'options `newArchEnabled`/`jsEngine` (nouvelle
   architecture et Hermes sont les seuls modes) ; `expo-system-ui` est requis pour que
   `userInterfaceStyle` soit honoré.
3. **`app.config.ts`** : la couleur crème est répétée en constante (`CANVAS`) car le chargeur de
   configuration Expo ne résout pas les sources TypeScript de `@learny/ui/tokens` ; `src/theme`
   reste la source de vérité à l'exécution.
4. **`packages/api-client`** : le champ `declare` d'`ApiError` est remplacé par une fusion de
   déclaration (même type public) car `babel-preset-expo` retire les types **Flow avant** les types
   TypeScript et refuse `declare` dans un corps de classe ; sans cela le bundle Android échoue
   (ADR-3012, ADR-3005 § 3).
5. **Version du runtime** : affichée `embedded` — la valeur d'empreinte est calculée par EAS
   (`runtimeVersion.policy = fingerprint`) et n'existe pas dans un build local `expo prebuild`.
6. **iOS** : non exécuté (pas de macOS) ; job CI manuel fourni.
7. **Tests préexistants rouges, hors périmètre mobile** (décision du porteur, non réparés et non
   affaiblis) : `packages/config/src/commit-rules.test.ts`,
   `apps/web/test/unit/bundle-split.test.ts`, `tools/migration/test/unit/report.test.ts`. Ils
   restent rouges sur la branche `mobile` et n'entrent pas dans les étapes de cette spécification
   (le comptage `[SPEC-3001]` ne les retient pas). Détail dans la section suivante.
8. **Build web préexistant en échec, hors périmètre mobile** : `pnpm build` échoue sur
   `@learny/web` (`Error occurred prerendering page "/_global-error"`,
   `TypeError: Cannot read properties of null (reading 'useContext')`). Ce n'est pas une régression
   de cette spécification : un A/B sur la branche le prouve — build identiquement en échec **avec**
   et **sans** les modifications de `packages/api-client` et `packages/i18n` de SPEC-3001
   (`/root/logs/web-build-a.log` et `web-build-b.log`). La piste mobile n'écrit pas dans
   `apps/web` (ADR-3001 § 4) ; l'étape `build` de `validate.mjs` est donc lancée avec
   `--skip-build`, le build de la piste mobile (`build:mobile:e2e`) étant prouvé ci-dessus.

## Échecs pré-existants (hors périmètre)

**Décision du porteur du projet** : ces tests sont déjà rouges sur la branche `mobile` avant
SPEC-3001 ; ils ne sont **ni réparés ni affaiblis** par cette spécification, et leur échec
n'invalide pas les étapes de la piste mobile. Ils sont néanmoins exécutés à chaque campagne : la
sortie ci-dessous est extraite du journal `validate.mjs` de cette spécification.

1. `packages/config/src/commit-rules.test.ts > [SPEC-002] commit rules > reports the plugin
   messages`

   ```text
   AssertionError: expected 'la portée doit être SPEC-xxx, CP-n, C…' to be 'la portée doit être SPEC-xxx, CP-n ou…'
   Expected: "la portée doit être SPEC-xxx, CP-n ou sdd"
   Received: "la portée doit être SPEC-xxx, CP-n, CP-NOM ou sdd"
   ```

2. `tools/migration/test/unit/report.test.ts > [SPEC-1302] permanent coupling check > contains no
   reference to the removed worker application outside historical material`

   ```text
   AssertionError: expected [ …(15) ] to deeply equal []
   ```

3. `apps/web/test/unit/bundle-split.test.ts` est listé par le porteur comme pré-existant ; il est
   **vert** sur cette branche au moment de la campagne (aucune action de cette spécification).

Ces trois fichiers sont hors du périmètre d'écriture de la piste mobile (ADR-3001 § 4) : aucun
d'entre eux n'est modifié par cette branche (`git log --oneline mobile..HEAD -- <chemin>` est vide
pour chacun).

## Commandes de reproduction

```sh
# 1. Application et tests
pnpm install
pnpm lint && pnpm typecheck
pnpm test:unit && pnpm test:mobile

# 2. APK de test (e2e)
cp apps/mobile/e2e/e2e.env.example apps/mobile/e2e/e2e.env   # renseigner API, agent, APK
pnpm build:mobile:e2e

# 3. Campagne Maestro (émulateur local, ou agent appareil distant)
pnpm test:e2e:mobile --tags SPEC-3001

# 4. Validation complète de la spécification (--skip-build : voir écart 8, build web préexistant)
node tools/sdd/validate.mjs SPEC-3001 --skip-build
```

Sur cette plateforme à deux VM :

```sh
# VM téléphone
DEVICE_AGENT_TOKEN=learny-e2e-token node apps/mobile/e2e/device-agent.mjs --port 8098
# VM dev : e2e.env pointe MOBILE_DEVICE_AGENT_URL, MOBILE_APK_URL et EXPO_PUBLIC_API_URL
```
