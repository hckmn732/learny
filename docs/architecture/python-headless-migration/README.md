# Audit et migration vers une API Python headless

Dossier produit le 21 novembre 2026 à partir du checkout main, commit 6881478a. Mission d’analyse/conception uniquement: aucun code applicatif, spec existante, migration DB, déploiement ou test modifié/exécuté. Diagnostics de lecture utilisés: migration report et next SDD. Les documentations officielles citées dans le rapport technologique ont été consultées le jour de rédaction.

## Synthèse

[01 — Synthèse exécutive](01-synthese-executive.md)
[02 — Audit de l’état actuel](02-audit-etat-actuel.md)
[03 — Cartographie des dépendances](03-cartographie-dependances.md)
[04 — Architecture cible](04-architecture-cible.md)
[05 — Évaluation des technologies](05-evaluation-technologies.md)
[06 — Contrat API](06-conception-contrat-api.md)
[07 — Domaines métier](07-architecture-domaines.md)
[08 — Scalabilité et performances](08-scalabilite-performances.md)
[09 — Expérience développeur](09-experience-developpeur.md)
[10 — Stratégie de migration](10-strategie-migration.md)
[11 — Sécurité et observabilité](11-securite-observabilite.md)
[12 — Feuille de route SDD](12-feuille-de-route-sdd.md)
[13 — Propositions d’ADR](13-propositions-adr.md)
[14 — Risques et questions ouvertes](14-risques-questions-ouvertes.md)
[15 — Backlog d’implémentation](15-backlog-implementation.md)

## Exécution SDD

Le dépôt porte la piste `python-migration` (ADR-2001) : 13 spécifications SPEC-2001 → SPEC-2302 en 4 phases (P20 → P23, checkpoints CP-20 → CP-23), partant de `main` sans dépendance à une autre piste. Voir [12 — Feuille de route SDD](12-feuille-de-route-sdd.md). Les validations listées dans chaque spec sont exécutées au moment de son implémentation.

## Conclusion d’audit à retenir

Learny a une API séparée Hono et le web ne dépend plus directement des paquets serveur. L’autonomie runtime du web est partielle: Next reste proxy et gardien de session/route. La migration Python serait un portage du backend et de ses contrats, DB/RLS, workflows, IA et ingestion; elle ne part pas d’un backend encore intégré aux routes Next.

Le choix FastAPI est un candidat provisoire, pas une décision acceptée. Il faut d’abord résoudre l’incohérence de la piste SDD Hono/Python, terminer ou réviser la dépendance CP-8, dresser l’inventaire des 219 routes, et démontrer les bénéfices de Python par POC avec même RLS, SSE, jobs et charge. Les limites de sécurité et les règles métier existantes restent normatives.

**Mise à jour du 21 novembre 2026 (ADR-2001 à ADR-2010)** : FastAPI, worker maison sur outbox, Coolify et staging fourni sont décidés ; la piste Python est la seule active et ne dépend plus de CP-8 ; l’écart 217/219 est un artefact de comptage (ADR-2004), il y a 217 opérations réelles.

## Sources de vérité internes

- Priorité documentaire: ADR > business-rules > spécifications > maquettes > autres documents.
- Documents lus: docs/engineering/sdd-process.md, docs/product/{vision,business-rules}.md, docs/architecture/{overview,data-model,api,ai}.md, docs/engineering/{conventions,testing,git}.md, ADR-1001..1009 et SPEC-1001..1302.
- Code examiné: apps/api, apps/web relay/session/client, packages/contracts, api-client, http, api-routes, services, db, llm, tutor, ingestion, jobs, notifications, automations, learning-engine et configuration racine.
- L’audit n’affirme pas qu’une suite passe: aucun test n’a été lancé. Les statuts SDD sont décrits comme état de suivi et comparés séparément au code.

[Annexe 02b — Inventaire OpenAPI (217 opérations)](02b-inventaire-api-openapi.md)
