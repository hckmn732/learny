# ADR-2018 — Ports Playwright avec la facade Python

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-21
- **Liens** : SPEC-2003

## Contexte

SPEC-2003 exige que le web passe par la facade Python (PORT+1) qui relaie vers Hono. Le plan de piste proposait Hono sur PORT+2 (3102) avec PLAYWRIGHT_PORT=3100, mais le test e2e de SPEC-006 demarre lui-meme un serveur Next sur 3102 pour verifier le refus de la garde SDD : cette valeur est une assertion existante et ne peut pas etre modifiee (ADR-2008).

## Décision

Le web reste sur PLAYWRIGHT_PORT (3100), la facade sur PORT+1 (3101) et Hono sur PORT+12 (3112), libre dans toutes les campagnes et sans collision avec les ports occupes de la VM ni avec les ports codes en dur par les tests existants.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
