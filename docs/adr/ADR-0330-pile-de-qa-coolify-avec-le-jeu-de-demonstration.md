# ADR-0330 — Pile de QA Coolify avec le jeu de démonstration

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-15
- **Liens** : SPEC-115, SPEC-012

## Contexte

Le porteur du projet veut une pile de recette sur Coolify, avec des données fictives, pour la QA visuelle et manuelle, avant d'avoir un nom de domaine. Le jeu de démonstration SPEC-115 (pnpm db:seed:demo) reprend les données des maquettes à l'instant figé de l'ADR-0047, mais sa garde refuse APP_ENV=production|preview et tout hôte de base qui n'est ni local ni en .test. Les comptes de démonstration n'ont pas de mot de passe.

## Décision

Une seconde pile, docker/compose.coolify-qa.yml, reprend la pile Coolify de production (ADR-0329) avec APP_ENV=local (IA, Stripe et notifications simulées, aucune clé de fournisseur), CLOCK_FIXED_AT=2026-11-11T12:20:00Z par défaut et les pages /_dev activées. Un job seed (docker/qa-seed.Dockerfile) exécute le CLI de packages/db/src/seed après les migrations et le démarrage de GoTrue, avec APP_ENV=test ; un lien Compose donne à la base l'alias db.learny.test, visible de ce seul conteneur, pour satisfaire la garde sans la modifier. Le web et le worker attendent la fin réussie du job. Mailpit, protégé par MAILPIT_UI_AUTH, reçoit tous les e-mails d'Auth et de l'application : les testeurs s'y connectent par lien. Les adresses sslip.io de Coolify remplacent un nom de domaine.

## Conséquences

Chaque déploiement remet les données de démonstration dans leur état de référence ; les comptes créés à la main sont conservés. La pile de QA ne doit contenir ni données réelles ni secrets de production. L'URL publique permet à quiconque la connaît de créer un compte. La production n'a pas de job seed. Guide : docs/operations/coolify-qa.md.
