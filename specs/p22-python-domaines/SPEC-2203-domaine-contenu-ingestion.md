---
id: SPEC-2203
title: Domaine Content & Retrieval et ingestion en Python
phase: P22
priority: migration
depends_on: [SPEC-2201]
business_rules: [BR-PLA-04]
screens: []
adrs: [ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-0023]
visual: demo
---

# SPEC-2203 — Domaine Content & Retrieval et ingestion en Python

## 1. Objectif

Porter en Python les contextes content et basculer toutes leurs entrées vers le runtime Python, sans aucun changement de comportement visible.

## 2. Contexte

Périmètre TypeScript source : `packages/ingestion`, `packages/services` (ressources, cours), recherche pgvector. L'inventaire et les oracles de SPEC-2001 donnent la liste exacte des opérations, événements et tâches, et les références de parité.

État de départ : branche `main` (ADR-2001) ; le web est un client pur de l'API Hono `apps/api` (217 opérations). Références : `docs/architecture/python-headless-migration/` (audit 01–15), `docs/product/business-rules.md`, `docs/architecture/{overview,data-model,api,ai}.md`, `docs/engineering/{conventions,testing,git}.md` et les ADR de la section 15. Invariant (ADR-1001, ADR-2008) : aucun changement fonctionnel visible, aucune assertion d'oracle modifiée, aucune ligne de base visuelle régénérée.

## 3. Dépendances

- **SPEC-2201** — terminée et fusionnée dans `main`.
- Supabase local (PostgreSQL, Auth, Storage) pour l'intégration ; fournisseurs externes en mode mock (ADR-0048).

## 4. Règles métier couvertes

Aucune règle nouvelle. Règles directement concernées : BR-PLA-04. Toutes les règles `BR-*` couvertes par le code porté restent actives et leurs tests sont rejoués.

## 5. Exigences fonctionnelles

- **EF-1** — Tous les cas d'usage du périmètre content existent dans `packages-py/learny` selon ADR-2003 et sont appelés à l'identique par HTTP, SSE, webhooks et worker.
- **EF-2** — Toutes les opérations, événements et tâches du périmètre listés dans `evidence/SPEC-2001/inventory.md` passent à `py` dans `api/ownership.yaml` ; aucune entrée du périmètre ne reste sans propriétaire.
- **EF-3** — Réponses, statuts, codes d'erreur, en-têtes, idempotence, effets en base et événements émis sont identiques à ceux du TypeScript sur les oracles de SPEC-2001.
- **EF-4** — Le code TypeScript du périmètre n'est plus exécuté pour les entrées basculées mais reste présent (retrait en SPEC-2302) ; remettre une entrée à `ts` restaure l'ancien comportement.

## 6. Exigences techniques

- **ET-1** — Domaine pur sans framework, ORM ni SDK ; contrats import-linter étendus au contexte (ADR-2003).
- **ET-2** — Écritures dans une UoW unique avec événements en outbox dans la même transaction (ADR-2006) ; consommateurs idempotents.
- **ET-3** — Requêtes utilisateur sous RLS avec les claims de la transaction ; rôle de service uniquement via `learny.shared.privileged` (ADR-2010).
- **ET-4** — Horloge injectée partout ; tests déterministes au 2026-11-11T12:20:00Z (ADR-0047) et `LLM_MODE=mock` (ADR-0048).
- **ET-5** — Tests TypeScript du périmètre portés en pytest avec les mêmes cas et assertions, consignés dans `evidence/SPEC-2001/test-port-map.md` (ADR-2008).

## 7. Comportements attendus et cas limites

- **CL-1** — Accès d'un autre utilisateur ou d'un membre non autorisé : même réponse de non-divulgation que le TypeScript, aucune donnée lue.
- **CL-2** — Requête rejouée avec la même clé d'idempotence, ou événement livré deux fois : un seul effet métier, même réponse.
- **CL-3** — Divergence de parité détectée sur un oracle : l'entrée reste à `ts` ; la divergence est corrigée dans le code Python, jamais dans l'oracle ni dans le test.
- **CL-4** — Dépendance externe indisponible (fournisseur IA, e-mail, stockage, paiement) : délai borné, erreur stable du contrat, aucune donnée validée perdue ; le mode mock couvre les tests.

## 8. Instructions d'implémentation

1. Relire les specs historiques du périmètre content, leurs règles `BR-*` et les tests TypeScript correspondants ; dresser la liste exacte des opérations, événements et tâches depuis `evidence/SPEC-2001/inventory.md`.
2. Porter d'abord le domaine pur avec ses tests pytest (oracles et propriétés), puis la couche application (cas d'usage, contrôles d'accès, ports), puis l'infrastructure (requêtes SQLAlchemy, adaptateurs).
3. Brancher les adaptateurs HTTP/SSE/webhook dans `apps/api-py` et les consommateurs dans `apps/worker-py`, sans logique métier dans ces adaptateurs.
4. Faire tourner le test de parité contractuelle du périmètre contre les deux propriétaires (`ts` puis `py`) sur les mêmes oracles ; zéro divergence inexpliquée.
5. Basculer les entrées du périmètre à `py` dans `api/ownership.yaml` par commits atomiques, rejouer les e2e affectés via la façade, puis mettre à jour la matrice de parité dans `evidence/<spec>/parity.md`.

Commits atomiques `feat|test|refactor(SPEC-2203): …` ; chaque commit compile et passe lint, typecheck et tests unitaires. Toute décision non couverte par un ADR est consignée par `node tools/sdd/adr.mjs new …` (plage ADR-2xxx).

## 9. Fichiers et composants concernés

- **Créés** — `packages-py/learny/content/{domain,application,infrastructure}`, adaptateurs dans `apps/api-py` et `apps/worker-py`, tests pytest et oracles rejoués.
- **Modifiés** — `api/ownership.yaml`, `api/contract-exceptions.yaml` (vide sauf ADR), `.importlinter`.
- **Lus/réutilisés** — `packages/ingestion`, `packages/services` (ressources, cours), recherche pgvector et leurs tests ; `packages/contracts` ; migrations SQL et politiques RLS du périmètre.
- **Intouchables** — `design/maquettes/`, `docs/legacy/`, oracles e2e/visuels existants, politiques RLS.

## 10. Interface et conformité visuelle

Aucun écran ni libellé ne change. Mode de validation `demo` : une page de démonstration SDD expose l'état de la spécification (propriétaires, parité, résultats) et fait l'objet d'un test `@visual`. Les tests visuels existants tournent via la façade Python contre les mêmes lignes de base (`docs/engineering/testing.md` §6) ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — Toutes les entrées du périmètre content sont à `py` dans `api/ownership.yaml` et la matrice `parity.md` (entrée → cas d'usage → règles → tables → tests) est complète.
- **CA-2** — Les tests de parité contractuelle du périmètre passent avec zéro divergence inexpliquée contre les oracles de SPEC-2001.
- **CA-3** — Les tests TypeScript du périmètre ont tous un équivalent pytest vert, référencé dans `test-port-map.md`.
- **CA-4** — Les contrats import-linter du périmètre passent et aucun adaptateur ne contient de règle métier.
- **CA-5** — Les e2e existants du périmètre passent sans modification à travers la façade Python, vidéo à l'appui.

## 12. Plan de tests

- **Unitaires** — pytest et Vitest étiquetés `[SPEC-2203]` : règles de domaine content, oracles et propriétés. Couvre CA-1, CA-2, CA-3, CA-4, CA-5.
- **Intégration** — `[SPEC-2203]` sur Supabase local, sérialisé par verrou de base : cas d'usage content sous RLS, outbox et consommateurs. Couvre CA-1, CA-2, CA-3, CA-4, CA-5.
- **E2E** — Playwright `@SPEC-2203` avec vidéo : parcours existants du périmètre content via la façade. Couvre CA-1, CA-2, CA-3, CA-4, CA-5.
- **Visuel** — `@SPEC-2203 @visual` sur la page de démonstration, viewport, seed et horloge figés.
- **Non-régression** — suites existantes affectées rejouées sans modification via la façade.

## 13. Preuves attendues

Dans `evidence/SPEC-2203/` : `acceptance.md` (chaque CA coché ✅ avec lien de preuve), rapports unitaires, intégration et e2e, vidéos, captures visuelles, résultats axe, et selon la spec matrice de parité, inventaire, mesures brutes. Chaque preuve indique date, environnement, commande et commit ; aucune valeur théorique présentée comme mesure.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7 : lint, typecheck, build (TypeScript et Python), tests unitaires et d'intégration `[SPEC-2203]`, e2e `@SPEC-2203` avec vidéo, au moins un test `@visual`, tous les CA prouvés, aucune régression. `node tools/sdd/validate.mjs SPEC-2203` puis `complete.mjs SPEC-2203`. Une dépendance externe réellement inaccessible est consignée par `fail.mjs SPEC-2203 "raison" --external` sans fausse preuve.

## 15. Décisions et hypothèses

- ADR applicables : ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-0023.
- Le modèle et la dimension d'embedding sont conservés ; tout changement exigera un ADR et un test de rappel.
- Hors périmètre : refonte visuelle ou fonctionnelle, changement de schéma sans ADR, clients mobiles, specs gelées par ADR-2001.
