# SPEC-4003 — Mode simple mobile : état des preuves

Branche `spec/SPEC-4003-mode-simple-parcours-mobile`, worktree `/home/ubuntu/learny-wt-SPEC-4003`.
Pile locale (`LLM_MODE=mock`, `CLOCK_FIXED_AT=2026-11-11T12:20:00Z`), émulateur Android API 35
(ADR-3018). Aucune preuve iOS : pas de macOS sur la VM (section 15 de la spec).

## Livré

- `apps/mobile/src/simple/` : libellés (`mobileSimple.ts`), cartes, dépôt, lignes de fichiers,
  rôles, encart sans clé, analyse, aperçu, diagnostic, résultat, file de téléversement reprenable
  (deux envois au plus), réception du partage, notification locale « Ton programme est prêt ».
- Routes : `app/formations/depot.tsx`, `[fid]/depot.tsx`, `[fid]/apercu.tsx`,
  `[fid]/diagnostic/index.tsx`, `[fid]/resultat.tsx`, `app/partage.tsx`.
- Partage natif : `ACTION_SEND`/`ACTION_SEND_MULTIPLE` et filtre VIEW dans `app.config.ts`,
  `CFBundleDocumentTypes` iOS, pont `/partage` avant/après connexion (ADR-4009).
- Parité testID : `apps/mobile/test/simple/parity.test.ts` (7 tests Jest, liste ET-3 identique).
- Tests : 16 Vitest (`src/simple/*.test.ts`), 3 intégration (`test/integration/simple.int.test.ts`),
  dont un envoi réel + finalisation d'un PDF.
- Correctif backend nécessaire : la taille d'un fichier simple est désormais mesurée à la
  finalisation (`insert_simple_resource`), sans quoi toute analyse répondait `SIMPLE_NO_COURSE_SOURCE`.

## Critères

- ✅ CA-2 — flux Maestro `SPEC-4003-partage` réussi (38 s, Android) : le fichier partagé ouvre le
  dépôt avec `simple-file-0`.
- ✅ CA-3 — flux Maestro `SPEC-4003-sans-cle` réussi (42 s, Android) : dépôt, création, encart
  `simple-key-warning`, fichiers conservés.
- ⚠️ CA-1 — le flux `SPEC-4003-parcours` atteint l'aperçu, valide le programme, crée le diagnostic
  et « Passer », mais la route de résultat ne s'ouvre pas dans le build courant : Maestro reste sur
  l'aperçu et l'assertion `simple-result-screen` échoue. Le parcours n'est donc pas prouvé de bout
  en bout.
- ⚠️ CA-4 — références 390×844 générées pour 6 étapes × 2 plateformes + sans clé
  (`design/references/mode-simple/`). La comparaison versionnée n'a pas été finalisée à cause du
  même blocage de navigation.
- ✅ CA-5 (partiel) — parité testID prouvée par `parity.test.ts` et opérations comparées au registre ;
  le journal d'opérations du parcours n'a pas été collecté jusqu'au bout.

## Blocage

La navigation `router.replace` vers `/formations/[fid]/resultat` (et la variante imbriquée
`diagnostic/resultat` avant aplatissement) ne monte pas l'écran dans le build Expo Router : l'écran
précédent reste affiché, alors que l'appel API `diagnostic.skip` a réussi. Le fichier de route est
présent dans le bundle (`simple-result-screen`), le typage passe, mais la route n'est pas résolue au
runtime. À reprendre après un build propre (ou en isolant la route de résultat dans un groupe/stack
dédié), puis relancer `pnpm test:e2e:mobile --tags SPEC-4003` et `validate.mjs`.
