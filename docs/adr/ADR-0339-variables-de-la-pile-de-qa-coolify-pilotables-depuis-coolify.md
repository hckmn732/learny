# ADR-0339 — Variables de la pile de QA Coolify pilotables depuis Coolify

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-19
- **Liens** : SPEC-012, ADR-0330, ADR-0336, ADR-0047

## Contexte

La pile de QA (ADR-0330) fixait en dur dans docker/compose.coolify-qa.yml APP_ENV=local et les modes simulés (LLM, Stripe, push), le limiteur coupé et l'horloge figée : une variable modifiée dans Coolify n'avait aucun effet, ce qui empêchait toute recette avec les vrais fournisseurs sur la même pile. Coolify transmet ses variables à Docker Compose pour l'interpolation ${…} uniquement.

## Décision

Toutes les variables de l'application passent par ${VAR:-défaut} dans le compose de QA, avec pour défaut la valeur de recette actuelle : sans variable ajoutée, la pile est inchangée (vérifié par rendu docker compose config). Les modes restent explicites (mock) car plusieurs paquets lisent LLM_MODE, STRIPE_MODE et PUSH_MODE dans l'environnement brut. CLOCK_FIXED_AT garde la forme ${VAR:-défaut} (Coolify ne détecte que celle-ci et pré-remplit la variable avec le défaut) : absente ou vide = horloge figée ; la valeur `real` = horloge réelle, la commande des conteneurs web, worker et seed retirant alors la variable avant de lancer Node. Un interrupteur QA_SEED=off saute le chargement du jeu de démonstration. Les recettes preview et production sont documentées dans docs/operations/coolify-qa.md ; checkEnvironment reste le garde-fou des combinaisons interdites. NEXT_PUBLIC_SENTRY_DSN reste sans effet côté navigateur (valeur intégrée au build, non transmise en argument de build). La démo SPEC-512 traite une clé de recherche vide comme absente.

## Conséquences

Une QA avec IA, push, e-mails et Stripe en mode test est possible sans changer de fichier. Les clés fournies doivent rester propres à la QA (Stripe en mode test uniquement). Changer APP_ENV seul ne suffit pas : la configuration refuse le démarrage en nommant chaque variable manquante ou interdite.
