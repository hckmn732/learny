# SPEC-3003 — critères d'acceptation

Client d'API, session sécurisée et cache hors ligne. Chaque critère est prouvé par un test ou une
campagne réellement exécutés sur l'émulateur Android 15 / API 35 (VM `learny-android`), horloge
applicative figée à `2026-11-11T12:20:00Z`, barre d'état en mode démo. Résultats de la campagne :
`checks.json`, `unit.json`, `jest.json`, `integration.json`, `e2e-mobile.json`, vidéo et captures de
`artifacts/`, `api-request-log.txt`, `summary.md`.

- **Branche** : `spec/SPEC-3003-client-d-api-session-et-cache-hors-ligne`
- **Plateforme validée** : Android 15 / API 35, émulateur `agent37` 1080 × 2400, Maestro 2.12.1.
- **iOS** : non exécuté (aucune VM macOS, ADR-3004 § 6) ; voir l'écart 2.

## Critères

- ✅ **CA-1** — Le compte de démonstration se connecte, `/me` renvoie « Alex » avec le Bearer, sans
  cookie ni `Origin`. Preuve : `test/integration/session.int.test.ts` (connexion réelle au Supabase
  local, `/me` = « Alex », en-têtes capturés sans `cookie` ni `origin`, `Accept-Language: fr`,
  `X-Request-Id` UUID v4), `evidence/SPEC-3003/api-request-log.txt` (requête native réelle sur
  l'API locale, jeton masqué) et le flux Maestro `SPEC-3003-session` (`sdd-session-state` =
  `signedIn`, `sdd-me-firstname` = « Alex ») avec vidéo.
- ✅ **CA-2** — Un `401` provoque un seul renouvellement et une seule nouvelle tentative, y compris
  pour dix requêtes concurrentes ; un renouvellement refusé déconnecte et purge. Preuve :
  `src/auth/session-token.test.ts` (ET-2/CL-1, un renouvellement pour dix appels),
  `src/api/client.test.ts` (« dix requêtes concurrentes → 1 renouvellement, 10 reprises »,
  « second 401 remonté », « renouvellement refusé → onSessionExpired »), `test/auth/session.test.tsx`
  (purge + message « Votre session a expiré. Reconnectez-vous. »), intégration
  `session.int.test.ts` (401 réel contre l'API locale, reprise après renouvellement).
- ✅ **CA-3** — Le flux SSE de démonstration est reçu fragment par fragment. Preuve :
  `src/api/stream.test.ts` (lecture `text/event-stream`, trois fragments recomposés),
  `session.int.test.ts` (relais réel `GET /dev/sdd/relay-stream`), flux Maestro (`sdd-stream` =
  `fragment-1fragment-2fragment-3`) avec vidéo.
- ✅ **CA-4** — Après redémarrage hors ligne, la session et les données en cache sont disponibles et
  le bandeau hors ligne est affiché. Preuve : flux Maestro (`offline-banner` + libellé
  `mobile.offline.banner`, puis `stopApp`/`launchApp` → `sdd-cache-restored`, `signedIn`, « Alex »),
  `test/offline/offline-banner.test.tsx`, `src/data/persist.test.ts` (marqueur de restauration
  seulement si au moins une requête a été relue), capture visuelle `@visual`.
- ✅ **CA-5** — Aucune valeur de session n'est stockée en clair. Preuve :
  `src/auth/secure-storage.test.ts` (le trousseau ne reçoit que la clé de 32 octets ; les octets du
  magasin chiffré ne contiennent ni `access_token`, ni `refresh_token`, ni l'e-mail ; aller-retour
  exact), `jest.json` (`test/auth/session.test.tsx`).

## Validation des étapes

Campagne `node tools/sdd/validate.mjs SPEC-3003 --skip-build` — voir `checks.json` pour l'état
exact et `summary.md` pour le détail.

| Étape | Résultat | Détail |
|---|---|---|
| lint | ✅ | `pnpm lint` |
| typecheck | ✅ | `pnpm typecheck` |
| build | ⏭ | `--skip-build` : build web préexistant en échec (écart 1) |
| unit | ✅ | Vitest et Jest `[SPEC-3003]` |
| integration | ✅ | `apps/mobile/test/integration/session.int.test.ts` |
| e2e | ✅ | campagne Maestro `SPEC-3003`, 1 flux réussi, 1 vidéo |
| visual | ✅ | 1 comparaison `@visual` |
| acceptance | ✅ | 5/5 critères ✅ |

## Ce qui est livré

- `apps/mobile/src/auth/` : `secure-storage.ts` (adaptateur chiffré pur, clé 32 octets, CL-6),
  `secure-backend.ts` (le seul module qui touche `expo-secure-store` et MMKV), `supabase.ts`,
  `session-port.ts`, `session.tsx` (`useSession()`, EF-1/EF-3/CL-2), `session-token.ts`
  (renouvellement sérialisé, ET-2), `demo-credentials.ts`.
- `apps/mobile/src/api/` : `client.ts` (instance Bearer + `X-Request-Id` + `Accept-Language: fr`),
  `transport.ts` (`expo/fetch`, ET-5), `registry.ts`, `instance.ts`, `errors.ts` (EF-7, `429` →
  `Retry-After`), `stream.ts` (EF-8, SSE + annulation), `idempotency.ts` et
  `use-idempotency-key.ts` (ET-3), `uuid.ts`.
- `apps/mobile/src/data/` : `keys.ts`, `query-client.ts` (30 s / 24 h / 2 tentatives réseau, aucune
  sur 4xx), `persist.ts` (cache MMKV par compte et par version, CL-5), `providers.tsx` (cache monté
  après restauration de la session).
- `apps/mobile/src/offline/` : `network.ts` (état via `onlineManager`), `network-wiring.ts`
  (NetInfo + `AppState`), `queue.ts` (file vide, remplie par SPEC-3305), `purge.ts` (EF-6),
  `OfflineBanner.tsx` (EF-5).
- `apps/mobile/src/lib/dates.ts` (BR-ACC-07, fuseau de `/me`, repli `Europe/Paris`).
- `apps/mobile/app/_dev/sdd/SPEC-3003.tsx` (EF-9), `app/_layout.tsx` (fournisseurs),
  `packages/i18n/src/fr/mobile.ts` (espaces `session`, `offline`, `errors`, `sdd.spec3003`).
- Outillage : `apps/mobile/e2e/flows/SPEC-3003-session.yaml`, `apps/mobile/e2e/prepare-demo-user.mjs`
  (mot de passe du compte seedé, jamais affiché), `apps/mobile/e2e/request-log.mjs` (preuve CA-1),
  `e2e.env.example` complété, ADR-3014.

## Écarts et décisions

1. **`--skip-build`** : le build web est en échec de façon préexistante (`/_global-error`), démontré
   hors périmètre dans `evidence/SPEC-3001/acceptance.md` (décision du porteur). La piste mobile
   n'écrit pas dans `apps/web` (ADR-3001 § 4). L'APK e2e est construit à part (`expo prebuild` +
   `assembleRelease -PreactNativeArchitectures=x86_64`).
2. **iOS non exécuté** : aucune VM macOS. Les variantes iOS du stockage (trousseau
   `AFTER_FIRST_UNLOCK`) et le cas CL-6 sont couverts par `secure-storage.test.ts` et par le job
   manuel `ios` de `.github/workflows/mobile.yml`.
3. **Coupure réseau de la démonstration** : Maestro 2.12.1 ne pilote pas le mode avion (aucune
   commande, vérifié sur le binaire) et le transport dual-VM (ADR-3012) n'exécute `adb` qu'autour de
   la campagne. La page de démonstration expose donc `sdd-offline-toggle`, qui bascule le **même**
   `onlineManager` que NetInfo alimente ; la détection réelle est couverte par Jest et le câblage
   NetInfo reste le seul chemin de production (ADR-3014 § 5).
4. **Identifiants du compte de démonstration** : `MOBILE_DEMO_PASSWORD` de `e2e/e2e.env` (non
   versionné) est appliqué au compte seedé par `prepare-demo-user.mjs` et inliné sous
   `EXPO_PUBLIC_SDD_DEMO_PASSWORD` ; jamais affiché, jamais journalisé (ADR-3014 § 6).
5. **Assertions Maestro** : le matcher `text` est ancré et abîme les caractères accentués en transit
   (« Connecté » → « Connect? »). Les flux n'assertent que des `id` et des textes ASCII, et la page
   expose `sdd-session-state` (`signedIn` / `signedOut`) à cette fin.
6. **`openLink` après `clearState`** : l'application démarre sur `/`, redirigé vers la page de
   SPEC-3001 ; le flux attend cette page (`sdd-health`) avant le lien profond, sinon la redirection
   peut annuler la navigation (constaté sur cet émulateur).
7. **Tests préexistants rouges, hors périmètre** (décision du porteur, non réparés, non affaiblis) :
   `packages/config/src/commit-rules.test.ts`, `tools/migration/test/unit/report.test.ts`,
   `apps/web/test/unit/bundle-split.test.ts`.
8. **Incident d'outillage** : les caches Kotlin/Gradle de la VM de développement ont dû être
   réinitialisés (`Could not close incremental caches`, puis `javax/xml/bind/JAXBException`) après
   un nettoyage disque trop agressif ; aucune modification du dépôt n'en découle.

## Commandes de reproduction

```sh
# 1. Dépendances et pile locale
pnpm install
pnpm dev:up && pnpm db:reset && pnpm db:seed:demo

# 2. Compte de démonstration du e2e (mot de passe jamais affiché)
node apps/mobile/e2e/prepare-demo-user.mjs

# 3. Tests
pnpm lint && pnpm typecheck
pnpm test:unit && pnpm test:mobile
set -a; . ./.env.local; set +a
npx vitest run --project integration apps/mobile/test/integration/session.int.test.ts

# 4. APK e2e (VM dev ; `df -h /root` >= 4 Go)
set -a; . apps/mobile/e2e/e2e.env; set +a
export EXPO_PUBLIC_ENABLE_SDD_PAGES=1 EXPO_PUBLIC_CLOCK_FIXED_AT=2026-11-11T12:20:00Z
cd apps/mobile && npx expo prebuild -p android --no-install
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=x86_64

# 5. Campagne Maestro (agent appareil de la VM téléphone, ADR-3012)
cd apps/mobile/android/app/build/outputs/apk/release && python3 -m http.server 8099 &
pnpm test:e2e:mobile --tags SPEC-3003

# 6. Preuve CA-1 et validation
node apps/mobile/e2e/request-log.mjs
node tools/sdd/validate.mjs SPEC-3003 --skip-build
```
