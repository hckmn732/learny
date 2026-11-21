---
id: SPEC-2301
title: Déploiement Coolify, bascule progressive et rollback
phase: P23
priority: migration
depends_on: [SPEC-2206]
business_rules: [BR-PLA-04, BR-PLA-07]
screens: []
adrs: [ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-0041, ADR-2007, ADR-2009]
visual: demo
---

# SPEC-2301 — Déploiement Coolify, bascule progressive et rollback

## 1. Objectif

Mettre en production le runtime Python de façon réversible, avec des preuves mesurées sur le staging fourni par le porteur.

## 2. Contexte

À l'entrée de cette spec, toutes les entrées sont à `py` en local. ADR-2009 fixe l'environnement de preuve et le traitement des blocages externes.

État de départ : branche `main` (ADR-2001) ; le web est un client pur de l'API Hono `apps/api` (217 opérations). Références : `docs/architecture/python-headless-migration/` (audit 01–15), `docs/product/business-rules.md`, `docs/architecture/{overview,data-model,api,ai}.md`, `docs/engineering/{conventions,testing,git}.md` et les ADR de la section 15. Invariant (ADR-1001, ADR-2008) : aucun changement fonctionnel visible, aucune assertion d'oracle modifiée, aucune ligne de base visuelle régénérée.

## 3. Dépendances

- **SPEC-2206** — terminée et fusionnée dans `main`.
- Supabase local (PostgreSQL, Auth, Storage) pour l'intégration ; fournisseurs externes en mode mock (ADR-0048).

## 4. Règles métier couvertes

Aucune règle nouvelle. Règles directement concernées : BR-PLA-04, BR-PLA-07. Toutes les règles `BR-*` couvertes par le code porté restent actives et leurs tests sont rejoués.

## 5. Exigences fonctionnelles

- **EF-1** — Déployer api et worker sur Coolify (staging puis production) depuis l'image de la CI, avec migrations en job singleton.
- **EF-2** — Bascule par domaine en production via la surcharge de propriété, canary en lecture, un seul écrivain.
- **EF-3** — Runbooks de bascule, d'arrêt, de rollback et de restauration.
- **EF-4** — Client Bearer externe simulé, sans cookie, sur les opérations prévues.

## 6. Exigences techniques

- **ET-1** — Seuils d'ADR-0041 et BR-PLA-07 mesurés sur le staging, mesures brutes archivées.
- **ET-2** — Observabilité : journaux, traces, métriques et alertes sur erreurs, latence, outbox et pool.
- **ET-3** — Hébergement et données en UE (BR-PLA-04).

## 7. Comportements attendus et cas limites

- **CL-1** — Métrique de canary hors seuil : promotion bloquée, rollback automatique documenté.
- **CL-2** — Rollback pendant des mutations : drain puis rejeu avec clés d'idempotence, cohérence outbox vérifiée.
- **CL-3** — Staging indisponible : `fail.mjs SPEC-2301 … --external` pour les critères concernés, le reste prouvé en local.

## 8. Instructions d'implémentation

1. Configurer Coolify (services, secrets, sondes) et le pipeline de déploiement.
2. Exercer la bascule et le rollback sur staging, mesurer la charge.
3. Exercer une restauration de sauvegarde et documenter les durées.

Commits atomiques `feat|test|refactor(SPEC-2301): …` ; chaque commit compile et passe lint, typecheck et tests unitaires. Toute décision non couverte par un ADR est consignée par `node tools/sdd/adr.mjs new …` (plage ADR-2xxx).

## 9. Fichiers et composants concernés

- **Créés** — configuration Coolify, runbooks, scripts de charge.
- **Modifiés** — CI de déploiement, variables du web.
- **Lus/réutilisés** — `.github/workflows/deploy.yml`, `tools/deploy/`.
- **Intouchables** — `design/maquettes/`, `docs/legacy/`, oracles e2e/visuels existants, politiques RLS.

## 10. Interface et conformité visuelle

Aucun écran ni libellé ne change. Mode de validation `demo` : une page de démonstration SDD expose l'état de la spécification (propriétaires, parité, résultats) et fait l'objet d'un test `@visual`. Les tests visuels existants tournent via la façade Python contre les mêmes lignes de base (`docs/engineering/testing.md` §6) ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — api et worker tournent sur le staging Coolify et passent les sondes.
- **CA-2** — Un exercice de rollback après canary sur staging montre zéro perte d'événement ou de mutation.
- **CA-3** — Une restauration de sauvegarde sur staging est exécutée et chronométrée.
- **CA-4** — Les budgets d'ADR-0041 sont mesurés sur staging, mesures brutes jointes.

## 12. Plan de tests

- **Unitaires** — pytest et Vitest étiquetés `[SPEC-2301]` : règles de promotion et de surcharge de propriété. Couvre CA-1, CA-2, CA-3, CA-4.
- **Intégration** — `[SPEC-2301]` sur Supabase local, sérialisé par verrou de base : rollback local avec rejeu et cohérence outbox. Couvre CA-1, CA-2, CA-3, CA-4.
- **E2E** — Playwright `@SPEC-2301` avec vidéo : parcours web et client Bearer contre le staging. Couvre CA-1, CA-2, CA-3, CA-4.
- **Visuel** — `@SPEC-2301 @visual` sur la page de démonstration, viewport, seed et horloge figés.
- **Non-régression** — suites existantes affectées rejouées sans modification via la façade.

## 13. Preuves attendues

Dans `evidence/SPEC-2301/` : `acceptance.md` (chaque CA coché ✅ avec lien de preuve), rapports unitaires, intégration et e2e, vidéos, captures visuelles, résultats axe, et selon la spec matrice de parité, inventaire, mesures brutes. Chaque preuve indique date, environnement, commande et commit ; aucune valeur théorique présentée comme mesure.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7 : lint, typecheck, build (TypeScript et Python), tests unitaires et d'intégration `[SPEC-2301]`, e2e `@SPEC-2301` avec vidéo, au moins un test `@visual`, tous les CA prouvés, aucune régression. `node tools/sdd/validate.mjs SPEC-2301` puis `complete.mjs SPEC-2301`. Une dépendance externe réellement inaccessible est consignée par `fail.mjs SPEC-2301 "raison" --external` sans fausse preuve.

## 15. Décisions et hypothèses

- ADR applicables : ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-0041, ADR-2007, ADR-2009.
- ADR-2007, ADR-2009.
- Hors périmètre : refonte visuelle ou fonctionnelle, changement de schéma sans ADR, clients mobiles, specs gelées par ADR-2001.
