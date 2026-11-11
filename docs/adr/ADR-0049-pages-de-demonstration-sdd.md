# ADR-0049 — Pages de démonstration SDD

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-006

## Contexte

Toute spécification doit produire une vidéo Playwright, y compris les spécifications sans écran.

## Décision

Route `apps/web/app/_dev/sdd/[specId]` activée par `ENABLE_SDD_PAGES=true` (jamais en production, vérifié par test), une page par spécification non visuelle qui exerce la capacité et affiche les résultats ; index `/_dev/sdd`.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
