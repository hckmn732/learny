# 15 — Backlog d'implémentation

Le backlog est porté par l'unique [SPEC-MIGRATION](../../../specs/p-migration/SPEC-MIGRATION-api-python-headless.md). Les priorités sont les lots internes d'une même spécification et ne constituent pas des IDs SDD supplémentaires.

| Priorité | Lot | Travail | Sortie exigée |
|---|---|---|---|
| P0 | 0 | Réconcilier `main`, branche/worktrees migration, CP-8, progression, preuves, code et choix Hono/Python | État canonique documenté, routes/jobs/RLS/tests inventoriés, ADR de migration |
| P1 | 1 | Workspace Python, ASGI, contrat OpenAPI et SDK TS, CI, erreurs, logs et health/readiness | Install/build reproductibles et compatibilité contractuelle |
| P1 | 2 | Connexion Auth/Bearer/cookies, PostgreSQL, RLS, Storage, UoW et relais web | Tests d'accès, identité, transactions et secrets côté serveur |
| P2 | 3 | Contextes domaine/application/infrastructure, ports, outbox et workers | Verticaux métier déterministes, testés et appelables par API/jobs |
| P2 | 4 | Migration de toutes les opérations et événements en lots par domaine | Parité d'API/job sans divergence inexpliquée, un seul écrivain |
| P3 | 5 | Raccorder le web/SSR et client Bearer, bascule/canary et rollback | E2E, seuils mesurés, rollback réellement exercé |
| P3 | 6 | Tests complets, charge/sécurité, restore, documentation et retrait du runtime TypeScript ciblé | CA prouvés, runbooks opérationnels, CP-MIGRATION vert |

## Ordre des domaines

Identity & Access; Formation & Programme; Learning State & Planning; Assessments; Content & Retrieval; Tutor & Conversations; Engagement; Billing & Entitlements; Privacy & Accounts. L'ordre exact des verticales et les dépendances confirmées se consignent dans les preuves du lot 0. Chaque lot conserve ses tests et son rollback avant de passer au suivant.

## Gates avant cutover

- CP-8 passé sur la piste produit.
- Conflits avec les ADR existants tranchés et consignés avant tout code incompatible.
- Routes, jobs, droits RLS, contrats, erreurs et tests attribués à un domaine.
- OpenAPI et client TypeScript validés par CI.
- Aucun cutover si la parité, les tests d'accès, l'observabilité, le rollback ou la restauration ne sont pas prouvés.

La création de ce backlog n'exécute aucun test et ne certifie aucun résultat de migration.
