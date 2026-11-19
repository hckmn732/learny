# ADR-0341 — Piste SDD de migration et branche `migration`

- **Statut** : Acceptée — complète ADR-0001 et ADR-0005 ; amende ADR-0049
- **Origine** : Validée (décision prise avec le porteur du projet, 2026-11-18)
- **Date** : 2026-11-18
- **Liens** : ADR-0001, ADR-0005, ADR-0049, ADR-0336, AGENTS.md, docs/engineering/sdd-process.md, docs/engineering/git.md

## Contexte

La boucle SDD (ADR-0001) enchaîne les phases P0 → P9 dans l'ordre : une phase n'est exécutable que si le checkpoint de la précédente est réussi. La séparation backend/frontend (ADR-0336) doit avancer **en parallèle** de la livraison V1 (CP-7 et SPEC-807/808 restent à faire sur `main`), sur une branche dédiée, et être exécutée et testée par un agent en totale autonomie. Avec l'outillage d'origine, un agent démarrant sur cette branche aurait d'abord exécuté CP-7 puis la fin de la V1.

## Décision

1. **Pistes** : le catalogue (`specs/catalog.json`) peut répartir les phases en pistes (`phase.track`, « produit » par défaut). Chaque piste est une suite ordonnée indépendante : une phase est débloquée par le checkpoint de la phase précédente **de la même piste** et par les checkpoints listés dans `phase.requires`. `catalog.activeTrack` désigne la piste que `next.mjs` pilote ; `SDD_TRACK` la surcharge.
2. **Configuration d'une piste** (`catalog.tracks.<piste>`) : `baseBranch` (départ des branches `spec/…`, cible des fusions `--no-ff` et du push) et `versionTags` (tags SemVer aux checkpoints).
3. **Piste `migration`** : phases P10 à P13, checkpoints CP-10 à CP-13, spécifications **SPEC-1001 à SPEC-1302** (identifiants à 4 chiffres, phase × 100 + rang), priorité `migration`, `baseBranch: "migration"`, `versionTags: false` (tags `cp-10`… seulement).
4. **Branche `migration`** : créée depuis `main` (773a4859). Sur cette branche, `catalog.activeTrack = "migration"`. `main` est fusionnée dans `migration` **au moins une fois par jour** et avant chaque checkpoint (`git merge --no-ff main`). Résolution des conflits de suivi : dans `progress/state.json`, garder les entrées de `main` pour les spécifications et checkpoints de la piste « produit » et celles de `migration` pour la piste « migration », puis régénérer `progress/PROGRESS.md` avec `node tools/sdd/status.mjs`. Un conflit de code est résolu en gardant le comportement de `main` et la structure de `migration`.
5. **Dépendance à la V1** : la phase P12 (bascule du web, la seule qui supprime ou déplace du code que `main` modifie encore) exige `CP-8` (`requires: ["CP-8"]`). P10 et P11, purement additives, démarrent immédiatement.
6. **Invariant** : chaque spécification de la piste rejoue en non-régression **toute** la suite existante qu'elle peut affecter ; CP-12 et CP-13 rejouent la suite complète, le cross-browser et les performances (`phase.checks`).
7. **Périmètre (ADR-0005)** : les spécifications SPEC-1001 à SPEC-1302 sont dans le périmètre ; elles n'ajoutent aucune fonctionnalité produit. Toute fonctionnalité visible reste interdite sur la piste.
8. **Pages de démonstration (ADR-0049)** : les spécifications de la piste utilisent le mode `demo` ; l'index `/_dev/sdd` et la route `[specId]` acceptent les identifiants à 4 chiffres.
9. **Fin de piste** : après CP-13, `migration` est fusionnée dans `main` par l'agent principal (`--no-ff`), `catalog.activeTrack` revient à `"produit"` dans le même commit de fusion, et la boucle reprend la piste produit (P9).

## Conséquences

- `tools/sdd/core.mjs`, `start.mjs`, `complete.mjs`, `checkpoint.mjs` et `next.mjs` gèrent les pistes (commit d'amorçage de la branche, tests `[SPEC-003]`).
- `COMMIT_SCOPE_PATTERN` accepte `SPEC-\d{3,4}` et `CP-\d{1,2}` ; l'audit reconnaît les identifiants à 4 chiffres.
- La CI se déclenche sur `migration` ; aucun déploiement de prévisualisation ni de production n'est fait depuis la piste avant SPEC-1103.
