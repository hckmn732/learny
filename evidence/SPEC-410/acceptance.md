# SPEC-410 — Critères d’acceptation

Validation exécutée sur la branche `spec/SPEC-410-selection-de-l-echauffement`, horloge figée
`2026-11-11T12:20:00Z` et IA simulée (`LLM_MODE=mock`). Preuves générées par
`node tools/sdd/validate.mjs SPEC-410` dans `evidence/SPEC-410/`.

## CA-1 — Trois identifiants uniques, veille seule limitée aux deux notions de la veille

✅ **CA-1** — Le test unitaire `CA-1 renvoie un prérequis puis une notion de la veille` sélectionne
`n-p1` (prérequis) puis `n-y2` (veille) et un troisième identifiant unique parmi les candidates
restantes ; la portée `yesterday` renvoie exactement `n-y2` et `n-y1`. Le test d’intégration compose
les liens SAP et renvoie `n-variante`, `n-societe`, `n-ledger` en taille 3. Le scénario e2e
`Sélection de l’échauffement @SPEC-410` vérifie les trois cartes, leurs raisons et la portée
« la veille seulement » (2 cartes). Preuves : `unit.json`, `integration.json`, `e2e.json`,
`video/`, `screenshots/spec-410-demo.png`.

## CA-2 — Une notion jamais vue ou suspendue n’apparaît jamais, même liée comme prérequis

✅ **CA-2** — Le test unitaire `CA-2 exclut notions jamais vues, suspendues, hors formation ou d’un
chapitre inaccessible` ne retient que `n-active` alors que quatre liens prérequis visent le chapitre
à venir ; `CL-3` vérifie le prérequis jamais étudié. L’intégration exclut `n-type` (suspendue),
`n-perimetre` (suspendue) et `n-partie` (jamais vue) des ensembles et du résultat. La région
`warmup-exclusions` de l’e2e affiche les cinq motifs d’exclusion. Preuves : `unit.json`,
`integration.json`, `e2e.json`.

## CA-3 — Tailles 2/3/5 et seed stables, sans doublon, banque courte

✅ **CA-3** — Le test unitaire `CA-3 respecte les tailles 2/3/5, la stabilité à seed égale et la
variété entre seeds` vérifie les trois tailles, l’invariance à l’ordre d’entrée, la variété sur
20 graines et le retour de 2 notions pour une taille 5. Les propriétés fast-check bornent la taille,
l’unicité et l’éligibilité. L’intégration `invariant à la répétition et à l’ordre des entrées`
compare les résultats après permutation ; la démonstration affiche 4 notions pour la taille 5.
Preuves : `unit.json`, `integration.json`, `e2e.json`.

## CA-4 — « Hier » évalué dans le fuseau de l’apprenant au passage d’heure

✅ **CA-4** — Le test unitaire `CA-4 évalue « hier » sur le calendrier local, pas sur 24 heures`
couvre l’heure d’hiver (`2026-10-25` → `2026-10-26`) et l’heure d’été (`2026-03-29` → `2026-03-30`).
L’intégration compose `localDateOf` avec la sélection : à `2026-10-25T23:30:00Z` (Paris
`2026-10-26`), seule la notion du `2026-10-25` local est retenue ; la notion du jour même est
exclue. La région `warmup-dst` de la démonstration montre le même calcul. Preuves : `unit.json`,
`integration.json`, `e2e.json`.

## CA-5 — Page SDD expliquée, vidéo, axe et test `@visual`

✅ **CA-5** — L’e2e `Sélection de l’échauffement @SPEC-410` conserve une vidéo réelle, passe
`axeCheck()` sans violation, vérifie les quatre régions, les contrôles de portée et de taille,
l’état vide et les exclusions. Le test `@SPEC-410 @visual @mobile` vérifie les jetons, la structure,
l’absence de débordement, axe et la capture de non-régression à 1 % (desktop et mobile). Preuves :
`e2e.json`, `e2e.xml`, `video/*.webm`, `screenshots/spec-410-demo*.png`, `visual/`,
`apps/web/e2e/__screenshots__/p4/spec-410.spec.ts/`.
