# SPEC-4003 — Mode simple mobile : état des preuves

Branche `spec/SPEC-4003-mode-simple-parcours-mobile`, worktree `/home/ubuntu/learny-wt-SPEC-4003`.
Pile locale (`LLM_MODE=mock`, `CLOCK_FIXED_AT=2026-11-11T12:20:00Z`), émulateur Android API 35
(ADR-3018). Aucune preuve iOS : pas de macOS sur la VM (section 15 de la spec).

## Livré

- `apps/mobile/src/simple/` : libellés, cartes, dépôt, lignes de fichiers, rôles, encart sans clé,
  analyse, aperçu, diagnostic, résultat, file de téléversement reprenable (2 envois au plus),
  réception du partage, notification locale « Ton programme est prêt ».
- Routes : `formations/depot`, `[fid]/depot`, `[fid]/apercu`, `[fid]/diagnostic/index`,
  `[fid]/resultat`, alias `formations/resultat`, pont `partage`.
- Partage natif : `ACTION_SEND`/`ACTION_SEND_MULTIPLE`, filtre VIEW, `CFBundleDocumentTypes`,
  pont `/partage` avant/après connexion (ADR-4009).
- Parité testID : `apps/mobile/test/simple/parity.test.ts` (20 identifiants ET-3).
- Tests : 16 Vitest, 7 Jest, 3 intégration (dont envoi + finalisation réelle d'un PDF).
- Correctif backend : `insert_simple_resource` ne fixe plus `size_bytes` avant la finalisation
  (`queries.py`), sinon toute analyse répondait `SIMPLE_NO_COURSE_SOURCE`.

## Critères

- ✅ CA-2 — `SPEC-4003-partage` réussi (38 s, Android) : fichier partagé → dépôt avec
  `simple-file-0`.
- ✅ CA-3 — `SPEC-4003-sans-cle` réussi (42 s, Android) : dépôt, création, `simple-key-warning`,
  fichiers conservés.
- ❌ CA-1 — `SPEC-4003-parcours` : dépôt des deux PDF, rôles, analyse, aperçu, `C'est parti`,
  création du diagnostic et « Passer » sont exécutés (API 200/201/204), mais l'écran de résultat ne
  monte pas après l'action en cours de flux ; Maestro reste sur l'aperçu et
  `simple-result-screen` échoue.
- ⚠️ CA-4 — références 390×844 générées (6 étapes × 2 plateformes + sans clé) ; comparaison
  versionnée non finalisée faute de parcours complet.
- ⚠️ CA-5 — parité testID prouvée et opérations comparées au registre ; journal d'opérations du
  parcours non collecté jusqu'au bout.

## Constats utiles pour la reprise

1. `testID="simple-result-screen"` est bien le `View` racine de `resultat.tsx`.
2. La route de résultat **fonctionne par deep link** :
   `adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d
   "learny://formations/<fid>/resultat?skipped=1"` affiche l'écran (carte « Ton premier chapitre
   est prêt », `Commencez`, `Voir le programme`, liste de préparation).
3. La navigation interne depuis le diagnostic ne monte pas cet écran, que l'on utilise
   `router.replace`/`router.push` avec objet, URL littérale, route dynamique ou alias statique.
   `diagnostic.skip` a bien répondu 204 ; aucun `ReactNativeJS`/`FATAL` dans `adb logcat`.
4. Le blocage est donc dans l'enchaînement de navigation Expo Router depuis `diagnostic/index.tsx`,
   pas dans le rendu de `resultat.tsx`.

## Blocage iOS

Pas de macOS ni de simulateur iOS sur la VM : preuve Android seulement, aucune preuve iOS
fabriquée. Conformément à la section 15 de la spec, le blocage externe iOS est consigné ici.
