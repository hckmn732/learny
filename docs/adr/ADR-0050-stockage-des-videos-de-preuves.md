# ADR-0050 — Stockage des vidéos de preuves

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-003, SPEC-004

## Contexte

Volume des vidéos.

## Décision

Vidéos `evidence/**/*.webm` suivies par Git LFS. Si Git LFS est absent, elles restent sur disque, exclues via `.git/info/exclude`, avec empreinte SHA-256 dans le résumé ; ce n'est pas un blocage.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
