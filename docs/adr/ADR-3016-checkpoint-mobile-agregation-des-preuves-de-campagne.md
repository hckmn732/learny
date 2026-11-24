# ADR-3016 — Checkpoint d'une phase mobile : agrégation des preuves de campagne

- **Statut** : Acceptée
- **Origine** : Déduite (exécution de CP-30, 2026-11-22)
- **Date** : 2026-11-22
- **Liens** : ADR-3001, ADR-3004, ADR-3012, ADR-3015, SPEC-3001, SPEC-3003

## Contexte

`tools/sdd/checkpoint.mjs` exécute une liste de contrôles **générique** : `audit`, `lint`,
`typecheck`, `build`, `test:unit --coverage`, `test:int`, puis `pnpm test:e2e` — la suite
Playwright du web. Exécuté pour CP-30 (premier checkpoint de la piste `mobile`), il échoue pour
deux raisons qui n'ont rien à voir avec la piste mobile :

1. la suite web exige un navigateur et une base seedée pour ses propres fixtures ; dans
   l'environnement mobile elle échoue en 1 ms par test, avant toute navigation ;
2. surtout, ce n'est pas le contrôle pertinent : la piste mobile ne modifie pas le web
   (ADR-3001 §4 et §7), et sa validation est une **campagne Maestro étiquetée par
   spécification** (ADR-3004, ADR-3012, ADR-3015), pas une suite Playwright globale.

Aucun checkpoint mobile ne peut donc passer, ce qui verrouille P31 → P35.

## Décision

Pour une phase dont la piste est `mobile`, `checkpoint.mjs` :

1. conserve `audit`, `lint`, `typecheck`, `build`, `test:unit --coverage`, `test:int` (le socle
   partagé et la non-régression du monorepo) ;
2. **remplace** `pnpm test:e2e` par `node tools/sdd/mobile-evidence.mjs <SPEC…>` qui agrège les
   preuves déjà produites par `validate.mjs` pour chaque spécification de la phase : présence de
   `evidence/<SPEC>/e2e-mobile.json`, au moins un flux Maestro réussi, aucun flux en échec, au
   moins une comparaison visuelle, au moins une capture, et `acceptance.md` présent ;
3. conserve `cross-browser` et `perf` pour les checkpoints qui les demandent explicitement
   (`checks` de la phase), inchangés.

Le rapport `evidence/checkpoints/CP-n/summary.md` liste ces contrôles comme les autres.

## Conséquences

- Un checkpoint mobile atteste ce qu'il doit attester : chaque spécification de la phase a une
  campagne **réellement exécutée sur l'appareil**, avec vidéo, capture et comparaison visuelle.
- La non-régression web reste couverte par ses propres checkpoints (CP-8, CP-9) sur la piste
  `produit` ; la piste mobile ne peut pas la masquer puisqu'elle ne touche pas `apps/web`.
- Le contrôle est une agrégation de preuves : une preuve inventée reste impossible à produire
  sans campagne, puisque `e2e-mobile.json` est écrit par le lanceur après l'appareil.
