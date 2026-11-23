# ADR-3018 — Environnement mobile sur une VM unique avec émulateur local

- **Statut** : Acceptée — remplace ADR-3012 § 1 (transport appareil) et ADR-3015 § 1 (jobs
  asynchrones) ; précise ADR-3004 § 6 et complète ADR-3016
- **Origine** : Validée (décision du porteur du projet, 2026-11-23)
- **Date** : 2026-11-23
- **Liens** : ADR-3004, ADR-3012, ADR-3015, ADR-3016, SPEC-3001

## Contexte

La piste mobile a été équipée (ADR-3012) de deux VM Agent37 : `d5xgz0v1b9` (`learny-dev`) porte le
dépôt, l'API locale et la boucle SDD ; `i96p0dwzbg` (`learny-android`, 8 Go) porte l'émulateur
Android, Maestro et un agent HTTP, joignable par des ports HTTPS publiés. Les campagnes de
SPEC-3001 à SPEC-3201 ont échoué à répétition, **toujours pour l'outillage, jamais pour le
produit** :

1. **Transport HTTP dual-VM** : l'edge coupe les requêtes longues ; le lanceur reçoit
   `container_unreachable` alors que Maestro continue sur l'appareil.
2. **Agent mono-requête** : un Maestro fantôme laissé vivant après une coupure bloque toutes les
   campagnes suivantes jusqu'au redémarrage manuel de l'agent.
3. **Module `artifacts.mjs` manquant** : la version de l'agent déployée sur la VM téléphone ne
   correspondait pas au lanceur ; les artefacts n'étaient plus rattachés aux flux et plusieurs
   flux visuels héritaient de la même capture.
4. **Ports publics re-mintés** : chaque `publish` crée une URL neuve ; après un redémarrage ou un
   `resize` d'instance, l'URL de `e2e.env` ne route plus et la campagne échoue au téléchargement
   de l'APK.
5. **Saturation mémoire** : 8 Go pour l'émulateur, Maestro et l'agent ; ANR SystemUI et flux
   rouges trompeurs, sans rapport avec le code testé.

Le coût est double : deux déploiements à maintenir (dépôt d'un côté, agent et AVD de l'autre) et un
transfert d'APK par HTTP à chaque campagne. Or la VM de développement est passée à **4 vCPU /
16 Go / 40 Go** et expose `/dev/kvm` : l'émulateur Android y tient à côté de Supabase, de l'API et
de Gradle.

## Décision

1. **Une seule VM.** `learny-dev` héberge le dépôt, la pile locale (Supabase, Inngest, Mailpit),
   l'API, l'**émulateur Android local**, `adb` et Maestro. La VM `i96p0dwzbg` est abandonnée :
   aucune validation ne dépend plus d'elle.
2. **Émulateur local `learny`.** AVD **Pixel 6**, image
   `system-images;android-35;google_apis;x86_64`, **3072 Mo** de RAM, 4 cœurs, **démarrage à
   froid** (aucun instantané), GPU logiciel (`swiftshader_indirect`), sans fenêtre.
   `tools/dev/emulator-up.sh` (idempotent) crée l'AVD au besoin, démarre l'émulateur et attend
   `sys.boot_completed`, puis affiche modèle, version d'Android, API, résolution et RAM ;
   `tools/dev/emulator-down.sh` l'arrête et purge les verrous périmés.
3. **Réseau de l'émulateur.** L'API et Supabase sont joints par `10.0.2.2`, l'hôte de
   l'émulateur — c'est-à-dire la VM de développement elle-même :
   `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`, `EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321`.
   **Aucun port public n'est publié**, aucune URL signée n'est nécessaire : l'APK est installé
   directement depuis `android/app/build/outputs/apk/release/`. Android refuse le trafic en clair
   depuis `targetSdk` 28 : un plugin de configuration local
   (`apps/mobile/plugins/with-e2e-cleartext.cjs`) ne l'autorise que si
   `LEARNY_E2E_CLEARTEXT=1`, variable posée par `e2e/build-e2e.mjs`. Les builds EAS de production
   restent en HTTPS uniquement ; c'est l'équivalent Android du `NSAllowsLocalNetworking` d'iOS
   (ADR-3004 § 7).
4. **Harnais local par défaut, et seulement local.** `pnpm test:e2e:mobile` exécute
   `tools/dev/mobile-preflight.mjs` puis `apps/mobile/e2e/run-maestro.mjs` sur l'appareil local.
   Le préflight vérifie : **disque ≥ 4 Go**, **`adb devices`**, **`sys.boot_completed`**,
   **API 200**, **Supabase 200** ; il démarre l'émulateur (`tools/dev/emulator-up.sh`) s'il est
   absent. `MOBILE_DEVICE_AGENT_URL` et `MOBILE_DEVICE_AGENT_TOKEN` ne sont plus lus : les laisser
   dans `e2e.env` est une erreur du préflight, pas une option.
5. **Suppression du chemin distant.** `apps/mobile/e2e/device-agent.mjs`,
   `apps/mobile/e2e/agent-client.mjs` et leur suite `agent-client.test.ts` sont supprimés, ainsi
   que le transport `RemoteDevice`, les réglages de job asynchrone et le serveur statique de l'APK.
   Aucun autre test ne les utilisait ; les preuves historiques (`evidence/`) ne sont pas réécrites.
6. **Ce qui ne change pas.** Le JUnit de Maestro reste la seule source du statut des flux
   (ADR-3015 § 3), les artefacts restent rattachés au flux qui les a produits (§ 2), la
   comparaison visuelle garde le seuil de 12 % (ADR-3003 § 4), un seul flux `@visual` par
   spécification tant que la comparaison multi-flux n'est pas validée, `tools/sdd/mobile-evidence.mjs`
   agrège les preuves (ADR-3016), et les règles de build subsistent : ABI `x86_64`, un seul build à
   la fois, jamais de purge de `~/.gradle/caches/*/transforms`, jamais de suppression de
   `android/app/build/outputs` pendant une campagne.

## Conséquences

- **Plus aucun échec de transport** : `container_unreachable`, agent mono-requête, ports re-mintés
  et module `artifacts.mjs` absent disparaissent avec la seconde VM. Les échecs restants sont des
  assertions produit ou des limites de la VM unique (mémoire de l'émulateur, disque, builds
  concurrents).
- **Ce qui reste vrai d'ADR-3012 : rien d'opérationnel.** Le transport appareil, l'agent, son
  jeton, les ports publiés et la republication sont retirés. Ses constats § 2 à § 4 (versions
  Expo, configuration `app.config.ts`, compatibilité Babel/Flow) restent des contraintes de
  compilation, sans rapport avec l'environnement d'exécution.
- **ADR-3015** : l'outillage des jobs asynchrones et le préflight de republication sont rayés ;
  les artefacts par flux et le comptage par le JUnit restent en vigueur.
- **Nouvelle contrainte de ressources** : la VM unique partage 16 Go entre Docker/Supabase,
  Gradle, l'émulateur (3 Go) et Maestro. Un build concurrent pendant une campagne, ou un second
  émulateur, provoque des OOM et des flux rouges trompeurs ; le runbook impose la sérialisation
  et le seuil de 4 Go de disque.
- **Coût** : l'image système et l'AVD occupent ~4 Go du volume ; la VM téléphone, son agent et son
  déploiement ne sont plus payés ni maintenus.
- **Le build e2e n'est pas le build de production** : il active les pages SDD, fige l'horloge et
  autorise le HTTP local en clair ; ces trois écarts sont posés par `e2e/build-e2e.mjs` et
  `expo prebuild` les rejoue quand le projet natif est régénéré, jamais par une retouche manuelle
  de `android/`.
- La CI Android (`mobile.yml`) reste inchangée : elle exécute déjà le transport local sur son
  runner, où l'émulateur est sur la même machine que les tests.
