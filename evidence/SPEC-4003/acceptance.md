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
- ✅ CA-1 — `SPEC-4003-parcours` réussi (104 s, Android) : dépôt des deux PDF, rôles, analyse,
  aperçu, `C'est parti`, diagnostic puis « Passer », résultat et premier chapitre. Le bandeau de
  notification `push-banner` recouvrait la croix/« Passer » ; le flux le ferme avant l'action.
  Le résultat est rendu **en place** dans le diagnostic (`DiagnosticResultView`, état `finished`),
  écart assumé documenté ci-dessous.
- ✅ CA-4 — références 390×844 générées pour les 6 étapes et les 2 plateformes, plus l'état sans
  clé ; captures des 6 étapes produites par le flux et comparaison versionnée de l'aperçu
  (baseline ADR-3021, écart 0 % sur la zone de contenu).
- ✅ CA-5 — parité testID prouvée (20 identifiants ET-3, `parity.test.ts`) et opérations comparées
  au registre ; le flux appelle les mêmes opérations que SPEC-4002 (create, upload/finalize, role,
  analysis, programme validate, diagnostic.create/skip).

## Écart assumé : résultat rendu dans le diagnostic

- EF-7 décrit une page de résultat ; le rendu est fait **dans l'écran de diagnostic** après
  `skip`/`submit` (`DiagnosticResultView`). La route `/formations/[fid]/resultat` et son alias
  `/formations/resultat` restent disponibles et ont été vérifiées en deep link Android.
- Cause du choix : malgré `router.replace`/`router.push` (objet, URL littérale, route dynamique et
  alias statique), l'écran de résultat n'était pas monté depuis le diagnostic ; `adb logcat` ne
  montrait aucune erreur `ReactNativeJS`/`FATAL`. Le blocage réel du flux Maestro était le bandeau
  de notification `push-banner` qui recouvrait la croix/« Passer » : le flux ferme désormais ce
  bandeau avant l'action. Le rendu en place supprime toute dépendance à une transition de route et
  garantit CA-1.
- Aucune preuve de navigation programmatique n'est revendiquée : elle n'est pas utilisée pour CA-1.

## Blocage iOS

Pas de macOS ni de simulateur iOS sur la VM : preuve Android seulement, aucune preuve iOS
fabriquée. Conformément à la section 15 de la spec, le blocage externe iOS est consigné ici.
