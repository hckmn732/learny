# ADR-0302 — Compléments d’implémentation de l’ingestion des pages web, YouTube et images

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-510, ADR-0057, ADR-0159, ADR-0048

## Contexte

SPEC-510 fixe les extracteurs et les bornes, mais laisse ouvertes les décisions de ports, codes persistés et marquage des lectures modèle.

## Décision

safeFetch de @learny/core/net porte le garde anti-SSRF, robots et les bornes ; les extracteurs valident leurs sorties Zod ; le code WEB_ROBOTS_DISALLOWED est persisté en ROBOTS_DISALLOWED ; une lecture d’image est marquée dans metadata.ingestion (contentOrigin, visionModel, visionProvider, visionTask) ; les fixtures YouTube et web sont versionnées dans @learny/ingestion.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
