# ADR-2041 — Retrait des pages de démonstration SDD et des routes _dev

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : ADR-0049, ADR-2008, ADR-2036, SPEC-2302

## Contexte

Le porteur ne veut plus de pages de démonstration ni de routes _dev : le projet se concentre sur le fonctionnel, la progression se suit dans progress/PROGRESS.md. Les pages /_dev/sdd, les galeries /_dev/ui et /_dev/bricks et 61 opérations dev.* ne servaient qu aux preuves visuelles des spécifications non visuelles (ADR-0049).

## Décision

Retrait des pages de démonstration, des galeries, de leurs composants, des opérations dev.sdd.* et dev.* de démonstration (contrat 217 -> 156 opérations, routes spéciales 32 -> 11), des routes _dev/commit-check, secret-scan, demo-job et dev/sdd/relay-stream, et des tests e2e, unitaires et d intégration qui ne testaient qu elles. Conservé comme harnais de test hors production (ENABLE_SDD_PAGES) : le simulateur Stripe /_dev/stripe/checkout et /portal et ses opérations (session, checkoutPay, checkoutCancel, simulate), la boîte mail de test (dev.email.outbox et purge), la génération de rappels (dev.notificationsGenerate) et l événement de démonstration du worker (dev.events.demo.start et run). Les tests fonctionnels des fichiers mixtes sont conservés ; les références de maquette des tests visuels de la coquille sont lues sur disque ; le test 401 de SPEC-201 vise GET /api/v1/me. Les compteurs d inventaire passent à 156 et 11. Une spécification non visuelle n exige plus de page de démonstration ni de test @visual : unitaires, intégration et e2e fonctionnels suffisent. ADR-0049 est remplacé.

## Conséquences

Exception explicite à ADR-2008 pour les oracles des démonstrations supprimés. Les preuves historiques sous evidence/ restent en l état. validate.mjs et le processus SDD doivent cesser d exiger un test @visual pour les spécifications non visuelles (suite).
