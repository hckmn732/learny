# Runbook — développement et validation mobiles (VM unique)

Mode opératoire normatif de la piste `mobile` (ADR-3018, qui remplace le mode dual-VM d'ADR-3012
et l'outillage asynchrone d'ADR-3015 § 1). Toutes les commandes s'exécutent **dans la VM**, jamais
sur le poste local.

## 1. Une seule machine

| Rôle | Machine | Notes |
|---|---|---|
| Développement, API, émulateur | `d5xgz0v1b9` (`learny-dev`) | 4 vCPU / **16 Go** / **40 Go**, `/dev/kvm`, Ubuntu, Node 24.22.3, pnpm 10.34.9, JDK 21, SDK Android `/opt/android-sdk`, Maestro 2.12.1, Docker (Supabase, Inngest, Mailpit) |
| Émulateur | AVD `learny` sur la même VM | Pixel 6, Android 15 / API 35, 1080×2400, **3072 Mo**, 4 cœurs, démarrage à froid |
| API / web vus par l'émulateur | `10.0.2.2` = la VM elle-même | API `:3001`, Supabase `:54321`, web `:3100` |

La VM `i96p0dwzbg` (`learny-android`) est **abandonnée** : plus d'agent appareil, plus de port
public, plus de transfert d'APK. Le harnais ne connaît que l'appareil local (ADR-3018).

```sh
export ANDROID_SDK_ROOT=/opt/android-sdk ANDROID_HOME=/opt/android-sdk
export PATH="/opt/android-sdk/platform-tools:/opt/android-sdk/emulator:/opt/android-sdk/cmdline-tools/latest/bin:$HOME/.maestro/bin:$PATH"
```

## 2. Démarrer et arrêter l'émulateur local

```sh
bash tools/dev/emulator-up.sh      # idempotent : crée l'AVD au besoin, démarre, attend le boot
bash tools/dev/emulator-down.sh    # arrêt propre, verrous purgés
```

`emulator-up.sh` :

- crée l'AVD `learny` (Pixel 6, `system-images;android-35;google_apis;x86_64`) s'il n'existe pas,
  puis fixe **3072 Mo** de RAM, 4 cœurs, GPU logiciel et démarrage à froid ;
- démarre sans fenêtre (`-no-window -no-snapshot -no-boot-anim -gpu swiftshader_indirect`) et
  journalise dans `/root/logs/emulator.log` ;
- attend `adb devices` puis `sys.boot_completed=1` et le gestionnaire de paquets ;
- affiche le modèle, la version d'Android, l'API, la résolution et la RAM réelle.

Vérifications manuelles :

```sh
adb devices                                   # emulator-5554  device
adb shell getprop sys.boot_completed          # 1
adb shell getprop ro.build.version.sdk        # 35
adb shell getprop ro.product.model            # sdk_gphone64_x86_64 (Pixel 6)
```

Un seul émulateur à la fois. Jamais d'instantané : le démarrage à froid garantit un état
déterministe de l'appareil.

## 3. Préflight obligatoire avant toute campagne

`pnpm test:e2e:mobile` exécute d'abord `tools/dev/mobile-preflight.mjs` :

- **disque** : `df /root` ≥ **4 Go** (`MOBILE_DISK_MIN_GB`), seuil dur ;
- **appareil** : `adb devices` doit lister un appareil ; sinon le préflight lance
  `tools/dev/emulator-up.sh` (au plus `MOBILE_BOOT_TIMEOUT_S`, 600 s par défaut) ;
- **démarrage** : `sys.boot_completed` doit valoir `1` ;
- **API** : `GET <EXPO_PUBLIC_API_URL>/api/v1/health` → **200** (la sonde réécrit `10.0.2.2` en
  `127.0.0.1`, car `10.0.2.2` n'existe que dans l'émulateur) ;
- **Supabase** : `GET <EXPO_PUBLIC_SUPABASE_URL>/auth/v1/health` → **200** (401 accepté si la
  passerelle exige la clé anonyme) ;
- **`e2e.env`** : `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_WEB_URL` présents ; toute clé d'agent
  (`MOBILE_DEVICE_AGENT_URL`, `MOBILE_DEVICE_AGENT_TOKEN`, `MOBILE_APK_URL`) est une **erreur**,
  elle n'est plus lue (ADR-3018).

## 4. Boucle quotidienne (VM dev)

```sh
cd /root/learny-mobile
pnpm dev:up                                  # Supabase + Inngest + Mailpit (idempotent)
set -a; . ./.env.local; set +a               # l'API lit process.env (turbo filtre l'env)
pnpm --filter @learny/api dev                # http://127.0.0.1:3001
curl -s 127.0.0.1:3001/api/v1/health         # {"status":"ok","database":"ok"}
```

L'émulateur joint cette API par `http://10.0.2.2:3001` : aucun tunnel, aucun port public.

## 5. Build de l'APK e2e

```sh
export ANDROID_SDK_ROOT=/opt/android-sdk ANDROID_HOME=/opt/android-sdk
export ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64     # un seul ABI pour l'e2e
pnpm build:mobile:e2e
```

Règles :

- **un seul build à la fois** (verrou Gradle : deux builds concurrents échouent ou se bloquent) ;
  vérifier `pgrep -f gradle` avant de lancer ;
- **ne jamais** supprimer `~/.gradle/caches/*/transforms` : les en-têtes prefab des modules natifs
  (`kolibri`, `react-native-worklets`, `expo-modules-core`) y sont extraits et Gradle ne les
  réextrait pas toujours → `fatal error: '…' file not found` ;
- ne jamais supprimer `android/app/build/outputs` pendant une campagne : l'APK y est installé par
  le lanceur ;
- après un changement de JS/écran, **rebuild obligatoire** (le bundle JS est embarqué dans l'APK) ;
- après un changement de `EXPO_PUBLIC_*` (par exemple une URL d'API), Gradle peut considérer la
  tâche de bundle comme à jour : supprimer `app/build/generated/assets/react` puis reconstruire
  (c'est ce que fait le nettoyage ci-dessus), ou lancer
  `./gradlew :app:createBundleReleaseJsAndAssets --rerun-tasks` avant `pnpm build:mobile:e2e` ;
- `pnpm build:mobile:e2e` rejoue **`expo prebuild`** quand le projet natif manque ou quand le
  manifeste n'a pas encore l'autorisation e2e : il reste la conséquence de `app.config.ts`, jamais
  d'une retouche manuelle de `android/`. Le plugin `plugins/with-e2e-cleartext.cjs` y autorise le
  HTTP en clair vers `10.0.2.2`, et seulement quand `LEARNY_E2E_CLEARTEXT=1` (posé par
  `build-e2e.mjs`) ; les builds EAS de production restent en HTTPS ;
- `pnpm build:mobile:e2e` refuse de démarrer sous **4 Go** libres.

## 6. Campagne e2e

```sh
pnpm test:e2e:mobile --tags SPEC-xxxx        # toujours en arrière-plan (runbg), jamais en direct
```

- tout est local : le préflight puis `run-maestro.mjs` installent l'APK, figent la barre d'état
  (13:20, réseau et batterie pleins), lancent Maestro et rangent les artefacts ;
- le JUnit de Maestro est la **seule** source du statut des flux (ADR-3015 § 3) ; un rapport
  absent, vide ou sans `<testcase>` fait échouer la campagne explicitement ;
- chaque artefact est rattaché au flux qui l'a produit (ADR-3015 § 2) ;
- **un seul flux `@visual` par spec** tant que la comparaison multi-flux n'est pas validée sur deux
  specs consécutives ;
- un flux qui échoue est **retiré et documenté** dans `acceptance.md` ; il n'est jamais modifié
  pour passer ;
- Maestro 2.12.1 : `scrollUntilVisible` non fiable sur les listes longues ; asserter des `testID`
  visibles sans défilement, textes ASCII ancrés.

Preuves produites : `test-results/sdd/<SPEC>/e2e-mobile.json`, `e2e-mobile.xml`, capture par flux
et capture comparée (`*.diff.png`), vidéo dans `artifacts/campagne/campagne.mp4`.

## 7. RAM et CPU

La VM unique partage **16 Go** entre Docker/Supabase (~2 Go), Gradle (jusqu'à 4 Go), l'émulateur
(3 Go) et Maestro/Metro. Avant une campagne :

```sh
free -g | head -2                 # au moins 3 Go disponibles
pgrep -af 'gradle|metrox|metro' || true
```

- ne jamais lancer deux builds, ni un build pendant une campagne ;
- ne pas laisser un second émulateur (`adb devices` doit lister un seul appareil) ;
- un OOM se voit dans `dmesg -T | grep -i -E 'oom|killed process'` et dans
  `/root/logs/emulator.log` ; il produit des flux rouges trompeurs (ANR SystemUI, application
  tuée) : arrêter l'émulateur, libérer la mémoire, relancer `emulator-up.sh`.

## 8. Hygiène disque

Seuil : **4 Go libres** sur `/root` (`df -h /root`). Nettoyage sûr, hors campagne :

```sh
cd /root/learny-mobile/apps/mobile/android
./gradlew clean 2>/dev/null || true                      # jamais pendant une campagne
rm -rf app/build/intermediates .gradle
rm -rf /root/.gradle/daemon
pnpm store prune
docker builder prune -af
rm -f /root/*.apk /root/smoke* ; find /root/logs -name '*.log' -mtime +2 -delete
```

- **jamais** `~/.gradle/caches/*/transforms` (cf. § 5) ;
- **jamais** `android/app/build/outputs` pendant une campagne ;
- **jamais** `docker volume prune` : les volumes portent les données Supabase de démonstration
  (à recréer par `pnpm db:reset && pnpm db:seed:demo` si perdus) ;
- l'image système et l'AVD occupent ~4 Go : ils vivent dans `/root/android-sdk` (l'overlay `/` ne
  fait que ~10 Go) et ne se suppriment pas à chaque campagne.

## 9. Pannes connues et remèdes

| Symptôme | Cause | Remède |
|---|---|---|
| `aucun appareil adb local` | émulateur arrêté ou planté | `bash tools/dev/emulator-up.sh`, puis `adb devices` |
| `emulator-5554 offline` | démarrage interrompu, verrou périmé | `bash tools/dev/emulator-down.sh && bash tools/dev/emulator-up.sh` (démarrage à froid) |
| `sys.boot_completed` vide | l'émulateur boote encore | attendre ; au-delà de 600 s, lire `/root/logs/emulator.log` |
| `✖ disque` | moins de 4 Go libres | § 8, jamais de purge des `transforms` |
| `✖ API` / `✖ Supabase` | API ou pile locale arrêtée | `pnpm dev:up`, puis `set -a; . ./.env.local; set +a; pnpm --filter @learny/api dev` |
| `/health` → `database: not_configured` | `pnpm dev` (turbo) filtre l'env | démarrer l'API hors turbo, avec `.env.local` chargé |
| flux rouges + ANR SystemUI + application tuée | OOM : builds concurrents ou second émulateur | § 7 : sérialiser, redémarrer l'émulateur à froid, relancer la campagne |
| `Could not create service of type …` / blocage Gradle | deux `gradlew` concurrents | tuer le build orphelin (`pgrep -af gradle`), relancer un seul build |
| `fatal error: … file not found` (C++) | `transforms` purgés | rebuild complet **sans** purger les `transforms` |
| `createReleaseExpoConfig` échoue | env incomplet (`SUPABASE_ANON_KEY`, `ENABLE_SDD_PAGES`, `CLOCK_FIXED_AT`) | passer par `pnpm build:mobile:e2e`, pas par `gradlew` brut |
| APK avec l'ancienne URL d'API | bundle JS non reconstruit | § 5 : supprimer `generated/assets/react` puis reconstruire |
| « API injoignable — `NETWORK_ERROR` » sur la page SDD | trafic HTTP en clair refusé par Android (manifeste sans `usesCleartextTraffic`) | reconstruire par `pnpm build:mobile:e2e` (le prebuild rejoue le plugin, § 5) ; vérifier l'attribut dans l'APK |
| `MOBILE_DEVICE_AGENT_URL … n'est plus utilisé` | reste du mode dual-VM | supprimer les clés d'agent de `apps/mobile/e2e/e2e.env` (ADR-3018) |

## 10. Validation et livraison

```sh
node tools/sdd/validate.mjs SPEC-xxxx --skip-build   # --skip-build : le build web est cassé hors périmètre
node tools/sdd/complete.mjs SPEC-xxxx --no-merge --no-push
# le lead fusionne dans `mobile` (--no-ff) puis pousse (bundle + jeton gh)
```
