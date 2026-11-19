# ADR-0049 — Pages de démonstration SDD

- **Statut** : Acceptée — amendée par ADR-0338 et ADR-0341
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-006

> Amendée : la route accepte les identifiants à 4 chiffres de la piste de migration (ADR-0341) ; à partir de SPEC-1203, une page de démonstration ne lit ni n’écrit la base elle-même, elle appelle des routes `dev.sdd.*` de `apps/api` actives seulement avec `ENABLE_SDD_PAGES=true` (ADR-0338).

## Contexte

Toute spécification doit produire une vidéo Playwright, y compris les spécifications sans écran.

## Décision

Route `apps/web/app/_dev/sdd/[specId]` activée par `ENABLE_SDD_PAGES=true` (jamais en production, vérifié par test), une page par spécification non visuelle qui exerce la capacité et affiche les résultats ; index `/_dev/sdd`.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
