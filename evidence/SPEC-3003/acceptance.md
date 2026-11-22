# SPEC-3003 — critères d'acceptation

Client d'API, session sécurisée et cache hors ligne. Les preuves unitaires, d'intégration et les
observations sur l'appareil ont été réellement exécutées sur l'émulateur Android 15 / API 35 (VM
`learny-android`), horloge applicative figée à `2026-11-11T12:20:00Z`, barre d'état en mode démo.
**La campagne Maestro n'est pas verte** : elle est bloquée par le transport HTTP du harnais
dual-VM, pas par l'application (voir « Blocage e2e » ci-dessous). Les fichiers de résultats
(`unit.json`, `jest.json`, `integration.json`, `e2e-mobile.json`, `checks.json`), la vidéo et les
captures de `artifacts/`, ainsi que `api-request-log.txt` sont dans ce dossier.

- **Branche** : `spec/SPEC-3003-client-d-api-session-et-cache-hors-ligne`
- **Plateforme validée** : Android 15 / API 35, émulateur `agent37` 1080 × 2400, Maestro 2.12.1.
- **iOS** : non exécuté (aucune VM macOS, ADR-3004 § 6) ; voir l'écart 2.

## Critères

- ✅ **CA-1** — Le compte de démonstration se connecte, `/me` renvoie « Alex » avec le Bearer, sans
  cookie ni `Origin`. Preuve : `test/integration/session.int.test.ts` (connexion réelle au Supabase
  local, `/me` = « Alex », en-têtes capturés sans `cookie` ni `origin`, `Accept-Language: fr`,
  `X-Request-Id` UUID v4), `api-request-log.txt` (requête native réelle sur l'API locale, jeton
  masqué) et observation sur l'émulateur : la page `/_dev/sdd/SPEC-3003` affiche « Connecté »,
  `signedIn` et « Alex » (captures et vidéo de la campagne).
- ✅ **CA-2** — Un `401` provoque un seul renouvellement et une seule nouvelle tentative, y compris
  pour dix requêtes concurrentes ; un renouvellement refusé déconnecte et purge. Preuve :
  `src/auth/session-token.test.ts` (un renouvellement pour dix appels), `src/api/client.test.ts`
  (« dix requêtes concurrentes → 1 renouvellement, 10 reprises », « second 401 remonté »,
  « renouvellement refusé → onSessionExpired »), `test/auth/session.test.tsx` (purge + message
  « Votre session a expiré. Reconnectez-vous. »), intégration `session.int.test.ts` (401 réel
  contre l'API locale, reprise après renouvellement).
- ✅ **CA-3** — Le flux SSE de démonstration est reçu fragment par fragment. Preuve :
  `src/api/stream.test.ts` (lecture `text/event-stream`, trois fragments recomposés),
  `session.int.test.ts` (relais réel `GET /dev/sdd/relay-stream` = `fragment-1`, `2`, `3`),
  observation sur l'émulateur : `sdd-stream` affiche `fragment-1fragment-2fragment-3`.
- ✅ **CA-4** — Après redémarrage hors ligne, la session et les données en cache sont disponibles et
  le bandeau hors ligne est affiché. Preuve : `test/offline/offline-banner.test.tsx` (libellé
  `mobile.offline.banner`), `src/data/persist.test.ts` (le marqueur de restauration n'apparaît que
  si au moins une requête a été relue, buster par compte et par version), et observation sur
  l'émulateur après redémarrage : bandeau « Hors ligne · affichage des données enregistrées »,
  « Cache : 2 requête(s) en mémoire · restaurée depuis le stockage chiffré », session `signedIn`,
  « Alex ». Le flux Maestro qui devait le prouver passe la coupure réseau et le bandeau mais
  **s'arrête sur le transport** avant la fin (voir « Blocage e2e »).
- ✅ **CA-5** — Aucune valeur de session n'est stockée en clair. Preuve :
  `src/auth/secure-storage.test.ts` (le trousseau ne reçoit que la clé de 32 octets ; les octets du
  magasin chiffré ne contiennent ni `access_token`, ni `refresh_token`, ni l'e-mail ; aller-retour
  exact), `jest.json` (`test/auth/session.test.tsx`).

## Validation des étapes

Dernière exécution : `node tools/sdd/validate.mjs SPEC-3003 --skip-build`. État exact dans
`checks.json`.

| Étape | Résultat | Détail |
|---|---|---|
| lint | ✅ | `pnpm lint`, 0 avertissement |
| typecheck | ✅ | `pnpm typecheck` |
| build | ⏭ | `--skip-build` : build web préexistant en échec (écart 1) |
| unit | ✅ | Vitest + Jest `[SPEC-3003]` (88 Vitest, 13 Jest) |
| integration | ✅ | 3 tests `session.int.test.ts` contre la pile locale |
| e2e | ⏳ | bloqué par le transport du harnais, pas par l'application (section suivante) |
| visual | ⏳ | baseline non comparable : la capture n'est pas rattachée au flux quand l'appel `/maestro` est coupé |
| acceptance | ✅ | 5/5 critères ✅, blocage e2e documenté |

## Blocage e2e : transport HTTP long

La campagne Maestro n'a jamais pu être menée à son terme pour des raisons **d'outillage**, établies
par une dizaine de campagnes et par inspection de l'appareil :

1. **L'edge Agent37 coupe les requêtes HTTP longues** vers le port public : `RemoteDevice.call`
   échoue en `fetch failed` / `container_unreachable` après ~28 à 120 s alors que Maestro continue
   sur l'appareil. Les étapes courtes passent (`POST /device`, `/install`, `/freeze`), les étapes
   longues (`POST /maestro`, un flux de 30 à 75 s) cassent de façon reproductible. Ce n'est pas un
   défaut de l'application : les mêmes assertions passent quand on ouvre la page par `adb` et qu'on
   lit l'arbre d'accessibilité.
2. **L'agent appareil est mono-requête** : un `maestro` fantôme laissé par une campagne interrompue
   bloque toutes les suivantes (`container_unreachable`), et `pkill` lancé depuis une commande
   contenant le motif tue la session `exec` elle-même (règle 3 du BRIEF) ; il faut passer par
   `runbg` + `/root/agent-up.sh`.
3. **La baseline visuelle n'est pas comparable dans cet état** : quand l'appel `/maestro` est coupé,
   l'agent ne renvoie pas d'artefacts, donc `run-maestro.mjs` ne rattache aucune capture au flux ;
   avec une seule baseline (règle 6 du BRIEF, artefacts indexés par nom de fichier) le rapport sort
   `0 comparaison` et l'étape `visual` reste rouge sans que l'image soit en cause.
4. **Assertions Maestro 2.12.1** : le matcher `text` est ancré et abîme les caractères accentués en
   transit (« Connecté » arrive en « Connect? ») ; les flux n'assertent donc que des `id` et des
   textes ASCII, et la page expose `sdd-session-state` (`signedIn`/`signedOut`) et
   `sdd-network-state` (`online`/`offline`) à cette fin. Le bandeau lui-même est vérifié par son
   libellé, son `testID` de conteneur n'étant pas exposé à l'arbre d'accessibilité Android.

**Correctif attendu (chantier outillage, hors de cette spécification)** : faire de `/maestro` un job
asynchrone (POST qui rend un identifiant, GET de statut, artefacts par flux) et rattacher les
artefacts au flux par identifiant de campagne. La spécification pourra alors être revalidée sans
toucher à son code : l'application, les tests unitaires, d'intégration et les observations appareil
sont déjà en place.

## Ce qui est livré

- `apps/mobile/src/auth/` : `secure-storage.ts` (adaptateur chiffré pur, clé 32 octets, CL-6),
  `secure-backend.ts` (le seul module qui touche `expo-secure-store` et MMKV), `supabase.ts`,
  `session-port.ts`, `session.tsx` (`useSession()`, EF-1/EF-3/CL-2), `session-token.ts`
  (renouvellement sérialisé, ET-2), `demo-credentials.ts`.
- `apps/mobile/src/api/` : `client.ts` (Bearer + `X-Request-Id` + `Accept-Language: fr`),
  `transport.ts` (`expo/fetch`, ET-5), `registry.ts`, `instance.ts`, `errors.ts` (EF-7, `429` →
  `Retry-After`), `stream.ts` (EF-8, SSE + annulation), `idempotency.ts` et
  `use-idempotency-key.ts` (ET-3), `uuid.ts`.
- `apps/mobile/src/data/` : `keys.ts`, `query-client.ts` (30 s / 24 h / 2 tentatives réseau, aucune
  sur 4xx), `persist.ts` (cache MMKV par compte et par version, CL-5), `providers.tsx` (cache monté
  après restauration de la session).
- `apps/mobile/src/offline/` : `network.ts`, `network-wiring.ts` (NetInfo + `AppState`), `queue.ts`
  (file vide, remplie par SPEC-3305), `purge.ts` (EF-6), `OfflineBanner.tsx` (EF-5).
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
   la campagne. La page expose donc `sdd-offline-toggle`, qui bascule le **même** `onlineManager`
   que NetInfo alimente ; la détection réelle est couverte par Jest et le câblage NetInfo reste le
   seul chemin de production (ADR-3014 § 5).
4. **Identifiants du compte de démonstration** : `MOBILE_DEMO_PASSWORD` de `e2e/e2e.env` (non
   versionné) est appliqué au compte seedé par `prepare-demo-user.mjs` et inliné sous
   `EXPO_PUBLIC_SDD_DEMO_PASSWORD` ; jamais affiché, jamais journalisé (ADR-3014 § 6).
5. **`openLink` après `clearState`** : l'application démarre sur `/`, redirigé vers la page de
   SPEC-3001 ; le flux attend cette page (`sdd-health`) avant le lien profond, sinon la redirection
   peut annuler la navigation (constaté sur cet émulateur).
6. **Tests préexistants rouges, hors périmètre** (décision du porteur, non réparés, non affaiblis) :
   `packages/config/src/commit-rules.test.ts`, `tools/migration/test/unit/report.test.ts`,
   `apps/web/test/unit/bundle-split.test.ts`.
7. **Incident d'outillage** : les caches Kotlin/Gradle de la VM de développement ont dû être
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
