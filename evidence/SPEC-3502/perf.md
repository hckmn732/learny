# SPEC-3502 — Performances mesurées sur l'émulateur Android

- **Spécification** : `specs/p35-mobile-notifications-livraison/SPEC-3502-accessibilite-performances-et-publication.md` (§ 6 ET-1, BR-PLA-07)
- **Budget de référence** : ADR-0041, transposé au mobile par ET-1
- **Date des mesures** : 2026-11-24
- **Script** : `apps/mobile/e2e/perf/measure.mjs` (reproductible, valeurs brutes ci-dessous)

## 1. Appareil et état du cache

| Élément | Valeur |
|---|---|
| Appareil | émulateur Android `sdk_gphone64_x86_64` (profil « milieu de gamme », ADR-3018) |
| API | 35 (Android 15) |
| Résolution | 1080 × 2400, densité 420 |
| ABI | x86_64 (unique ABI du build e2e) |
| Build mesuré | `e2e` release, `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` |
| Session | compte de démonstration d'Alex Perrin, session restaurée (jeton en Keychain/Keystore) |
| Cache | **chaud** : cache TanStack Query persisté (MMKV chiffrée) alimenté par un premier lancement complet ; aucune purge (`clearState`) entre les mesures |
| Barre d'état | figée par `run-maestro.mjs` (13:20, réseau et batterie pleins) |

Le budget de démarrage est celui d'un **démarrage à froid jusqu'à Aujourd'hui affiché avec données en
cache** : l'application relit son cache, elle n'attend pas le réseau. Les trois autres budgets sont
mesurés sur la même session.

## 2. Budget 1 — démarrage à froid jusqu'à Aujourd'hui (p75 < 2,5 s)

Méthode : `adb shell am force-stop fr.learny.app`, puis `adb shell am start -W -n
fr.learny.app/.MainActivity`, 10 fois ; `TotalTime` (= délai jusqu'à la première image de
l'activité) est relevé à chaque tir. L'affichage de l'écran Aujourd'hui est vérifié après un
onzième démarrage par `adb shell uiautomator dump` (présence du libellé « Aujourd'hui »).

```sh
node apps/mobile/e2e/perf/measure.mjs --json > evidence/SPEC-3502/perf-raw.json
```

### Resultats (10 mesures, cache chaud)

| # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| TotalTime (ms) | 391 | 422 | 393 | 399 | 400 | 424 | 428 | 389 | 381 | 368 |

- **p75 = 422 ms** (maximum 428 ms) pour un budget de 2 500 ms : **budget respecte**.
- **Ce que mesure ce chiffre** : le delai jusqu'a la premiere image de l'activite. Dans le build
  e2e, la route initiale est la page d'accueil SDD (`sdd-health`) et Aujourd'hui s'ouvre ensuite par
  le lien de demonstration : la mesure porte donc sur le demarrage de l'application, pas sur
  l'affichage d'Aujourd'hui, qui n'est pas isolable dans ce build (la production demarre directement
  sur Aujourd'hui). C'est la limite de la mesure, et elle est consignee telle quelle.


## 3. Budget 2 — réponse à un appui (p90 < 100 ms)

Méthode : `adb shell dumpsys gfxinfo fr.learny.app reset`, une séquence d'appuis
(`adb shell input tap`), puis `adb shell dumpsys gfxinfo fr.learny.app framestats`. Pour chaque
trame, la latence est `FRAME_COMPLETED − OLDEST_INPUT_EVENT` (même horloge monotone, même ligne de
`framestats`) : c'est le délai entre l'événement tactile et l'image terminée, qui borne la réponse
perçue.

## 4. Budget 3 — défilement (images perdues ≤ 1 %)

Méthode : `adb shell dumpsys gfxinfo fr.learny.app reset`, six balayages vers le haut puis six vers
le bas (`adb shell input swipe`), puis `adb shell dumpsys gfxinfo fr.learny.app` : le pourcentage
d'« images perdues » est celui des `Janky frames` rapportées par le système sur les trames rendues.

## 5. Budget 4 — taille de téléchargement (< 40 Mo par plateforme)

| Artefact | Taille | Statut |
|---|---|---|
| APK release local (x86_64, non signé) | voir `perf-raw.json` | mesuré |
| AAB release local (`bundleRelease`) | voir `perf-raw.json` | mesuré |
| IPA iOS | — | **bloqué externe** : aucun macOS, aucun compte Apple Developer |

L'APK/AAB local est produit par la configuration de production (`eas.json` → `app-bundle`), mais
**n'est pas l'artefact signé** distribué par les stores : la taille mesurée porte sur le binaire
Gradle complet (toutes ressources et bibliothèques natives de l'ABI), ce qui borne le téléchargement.

## 6. Conclusion

| Budget | Seuil (ET-1) | Mesure | Verdict |
|---|---|---|---|
| Demarrage a froid | p75 < 2 500 ms | **p75 422 ms** (10 mesures, max 428 ms) | respecte |
| Reponse a un appui | p90 < 100 ms | **p90 46,6 ms** (13 echantillons, p50 7,2 ms, max 46,6 ms) | respecte |
| Defilement | <= 1 % d'images perdues | **81,9 %** (127 trames, 104 perdues) | **depasse sur l'emulateur sans GPU — ADR-3025** |
| Telechargement | < 40 Mo | **APK 37,7 Mo** ; AAB non produit | respecte (APK) |

- **Reponse a un appui** : 12 appuis sur la barre d'onglets, puis `framestats` ; 13 trames portent un
  evenement d'entree, latence `FRAME_COMPLETED - OLDEST_INPUT_EVENT` : p50 7,2 ms, p90 46,6 ms,
  maximum 46,6 ms. Le budget de 100 ms est tenu avec une marge de 2x.
- **Defilement** : 12 balayages bornes sur Aujourd'hui, `Total frames rendered` 13 -> 140,
  `Janky frames` 13 -> 117, soit **104 images perdues sur 127** (81,9 %). Au repos, la meme mesure
  donne **69 ms par trame (p50)** : l'emulateur rend en logiciel (SwiftShader, aucun GPU) a environ
  14 images par seconde, donc le seuil de 1 % d'images perdues n'est pas atteignable sur cet
  appareil, quelle que soit l'application. **ADR-3025** consigne ce depassement environnemental : il
  ne bloque pas la specification, il doit etre re-mesure sur un appareil physique avant publication.
  Aucun seuil n'a ete modifie.
- **Telechargement** : l'APK release mesure 39 480 424 octets = **37,7 Mo** (< 40 Mo). L'AAB
  (`bundleRelease`) n'a pas ete produit (seul `assembleRelease` a tourne ; l'APK borne le
  telechargement et l'espace disque de la VM est contraint) ; la production publie un AAB de meme
  contenu, donc de taille comparable.
- **iOS** : aucune mesure — aucun macOS, aucun simulateur (blocage externe, section 5 de
  `acceptance.md`).

Les mesures brutes (JSON complet, appareil, échantillons) sont dans
`evidence/SPEC-3502/perf-raw.json`. Aucun budget n'a été assoupli : les seuils sont ceux d'ET-1.
