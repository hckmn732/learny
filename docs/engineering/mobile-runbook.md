# Runbook — développement et validation mobiles (VM Agent37)

Mode opératoire normatif de la piste `mobile` (complète ADR-3012 et ADR-3015). Toutes les
commandes s'exécutent **dans les VM**, jamais sur le poste local.

## 1. Machines

| Rôle | Instance | Notes |
|---|---|---|
| Développement | `d5xgz0v1b9` (`learny-dev`) | 4 vCPU / 16 Go / **40 Go**, Ubuntu 26.04, Node 24.22.3, pnpm 10.34.9, JDK 21, SDK Android `/opt/android-sdk`, Maestro 2.12.1, Docker (Supabase, Inngest, Mailpit) |
| Téléphone | `i96p0dwzbg` (`learny-android`) | AVD `agent37`, Android 15 / API 35, 1080×2400, agent appareil sur 8098 |

## 2. Préflight obligatoire avant toute campagne

`pnpm test:e2e:mobile` exécute `tools/dev/mobile-preflight.mjs` :

- disque `df /root` ≥ **4 Go** (seuil dur ; en dessous, purger `intermediates`, jamais `outputs`) ;
- agent appareil joignable (`POST /device` avec `x-device-token`) — sinon il est redémarré ;
- APK servi : `MOBILE_APK_URL` doit répondre **200** ;
- URLs de `apps/mobile/e2e/e2e.env` cohérentes : un port public **périmé** (000/404) est
  **republié** et `e2e.env` réécrit (chaque `publish` crée une URL neuve) ;
- Maestro orphelin sur l'appareil (`pgrep maestro`) tué avant la campagne.

## 3. Boucle quotidienne (VM dev)

```sh
cd /root/learny-mobile
pnpm dev:up                                  # Supabase + Inngest + Mailpit (idempotent)
set -a; . ./.env.local; set +a               # l'API lit process.env (turbo filtre l'env)
pnpm --filter @learny/api dev                # http://127.0.0.1:3001
curl -s 127.0.0.1:3001/api/v1/health         # {"status":"ok","database":"ok"}
```

## 4. Build de l'APK e2e

```sh
export ANDROID_SDK_ROOT=/opt/android-sdk ANDROID_HOME=/opt/android-sdk
export ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64     # un seul ABI pour l'e2e
pnpm build:mobile:e2e
```

Règles :
- **un seul build à la fois** (verrou Gradle : deux builds concurrents échouent) ;
- **ne jamais** supprimer `~/.gradle/caches/*/transforms` : les en-têtes prefab des modules natifs
  (`kolibri`, `react-native-worklets`, `expo-modules-core`) y sont extraits, et Gradle ne les
  réextrait pas toujours → erreurs `fatal error: '…' file not found` ;
- ne jamais supprimer `android/app/build/outputs` pendant une campagne (l'APK y est servi) ;
- après un changement de JS/écran, **rebuild obligatoire** (le bundle est embarqué dans l'APK).

## 5. Campagne e2e

```sh
pnpm test:e2e:mobile --tags SPEC-xxxx        # toujours en arrière-plan (runbg), jamais en direct
```

- Le contrat est asynchrone (ADR-3015) : `POST /maestro` rend un `jobId`, le runner interroge
  l'agent ; une campagne ne dépasse jamais quelques secondes par requête.
- Un flux qui échoue est **retiré et documenté** dans `acceptance.md` ; il n'est jamais modifié
  pour passer.
- **Un seul flux `@visual` par spec** tant que la comparaison multi-flux n'est pas validée sur
  deux specs consécutives.
- Maestro 2.12.1 : `scrollUntilVisible` non fiable sur les listes longues ; matcher `text` ancré et
  accents abîmés en transit → assertions sur `testID` et textes ASCII.

## 6. Validation et livraison

```sh
node tools/sdd/validate.mjs SPEC-xxxx --skip-build   # --skip-build : le build web est cassé hors périmètre
node tools/sdd/complete.mjs SPEC-xxxx --no-merge --no-push
# le lead fusionne dans `mobile` (--no-ff) puis pousse (bundle + jeton gh)
```

## 7. Hygiène

- Nettoyage sûr : `app/build/intermediates`, `.gradle` du projet, `docker builder prune`,
  `pnpm store prune`, logs de plus de deux jours.
- **Jamais** `docker volume prune` (volumes Supabase = données de démonstration).
- Après `resize` ou redémarrage d'instance : relancer la pile (`pnpm dev:up`, API) et republier
  les ports publics.

## 8. Pannes connues et remèdes

| Symptôme | Cause | Remède |
|---|---|---|
| `container_unreachable` | requête longue coupée, port périmé, Maestro orphelin | préflight (republie + tue Maestro), contrat async |
| `curl: (22) 404` sur l'APK | serveur 8099 arrêté ou mauvais dossier | relancer `python3 -m http.server 8099` dans `outputs/apk/release` |
| `diffRatio` identiques sur plusieurs flux | artefacts non rattachés | ADR-3015 (artefacts par flux) |
| `fatal error: … file not found` (C++) | `transforms` purgés | rebuild complet sans purge des transforms |
| `/health` → `database: not_configured` | `pnpm dev` (turbo) filtre l'env | `set -a; . ./.env.local; pnpm --filter @learny/api dev` |
| `createReleaseExpoConfig` échoue | env incomplet (`SUPABASE_ANON_KEY`, `ENABLE_SDD_PAGES`, `CLOCK_FIXED_AT`) | passer par `pnpm build:mobile:e2e`, pas par `gradlew` brut |
