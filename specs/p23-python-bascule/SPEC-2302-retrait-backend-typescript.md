---
id: SPEC-2302
title: Non-régression complète et retrait du backend TypeScript
phase: P23
priority: migration
depends_on: [SPEC-2301]
business_rules: [BR-PLA-03, BR-PLA-07]
screens: []
adrs: [ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2011, ADR-0017, ADR-1002, ADR-2006]
visual: demo
---

# SPEC-2302 — Non-régression complète et retrait du backend TypeScript

## 1. Objectif

Terminer la migration : prouver la non-régression complète puis retirer le runtime TypeScript backend et Inngest.

## 2. Contexte

Après SPEC-2301, la production est servie par Python. Les tests TypeScript portés ont leurs équivalents pytest (ADR-2008).

**Canevas technique normatif (ADR-2011)** : `docs/architecture/python-backend/00-conventions.md` puis la section SPEC-2302 de `docs/architecture/python-backend/P23-plan.md`, à suivre pas à pas ; les prototypes validés sont décrits dans `docs/architecture/python-backend/spikes.md`. Le code Python est rédigé en anglais ; les textes vus par l'utilisateur restent en français, copiés à l'identique.

État de départ : branche `main` (ADR-2001) ; le web est un client pur de l'API Hono `apps/api` (217 opérations). Références : `docs/architecture/python-headless-migration/` (audit 01–15), `docs/product/business-rules.md`, `docs/architecture/{overview,data-model,api,ai}.md`, `docs/engineering/{conventions,testing,git}.md` et les ADR de la section 15. Invariant (ADR-1001, ADR-2008) : aucun changement fonctionnel visible, aucune assertion d'oracle modifiée, aucune ligne de base visuelle régénérée.

## 3. Dépendances

- **SPEC-2301** — terminée et fusionnée dans `main`.
- Supabase local (PostgreSQL, Auth, Storage) pour l'intégration ; fournisseurs externes en mode mock (ADR-0048).

## 4. Règles métier couvertes

Aucune règle nouvelle. Règles directement concernées : BR-PLA-03, BR-PLA-07. Toutes les règles `BR-*` couvertes par le code porté restent actives et leurs tests sont rejoués.

## 5. Exigences fonctionnelles

- **EF-1** — Exécuter la suite complète contre Python : e2e, visuel, axe (BR-PLA-03), cross-browser, charge et sécurité.
- **EF-2** — Retirer `apps/api`, les paquets backend devenus inutilisés, Inngest (ADR-0017 remplacé), le relais `ts` de la façade et les variables associées.
- **EF-3** — Conserver le web, le SDK généré et les paquets TypeScript encore utilisés par le web, avec propriétaires recensés.
- **EF-4** — Refaire l'inventaire et prouver qu'aucune opération, événement ou tâche n'est servi par du TypeScript.

## 6. Exigences techniques

- **ET-1** — Suppression d'un test TypeScript seulement si son équivalent pytest est vert (`test-port-map.md`).
- **ET-2** — Aucune ligne de base visuelle régénérée.
- **ET-3** — Documentation d'architecture, AGENTS.md et runbooks à jour.

## 7. Comportements attendus et cas limites

- **CL-1** — Paquet TypeScript encore importé par le web : conservé et recensé.
- **CL-2** — Test TypeScript sans équivalent pytest : retrait bloqué jusqu'au portage.
- **CL-3** — Régression détectée : corrigée dans le Python, jamais dans le test.

## 8. Instructions d'implémentation

Le détail technique (structure, motifs, extraits de code, pièges) est dans la section SPEC-2302 de `docs/architecture/python-backend/P23-plan.md` ; les étapes ci-dessous en sont le résumé.

1. Lancer la suite complète et traiter chaque écart.
2. Retirer le code par commits atomiques, en rejouant lint, typecheck et build à chaque étape.
3. Mettre à jour la documentation et clore la piste.

Commits atomiques `feat|test|refactor(SPEC-2302): …` ; chaque commit compile et passe lint, typecheck et tests unitaires. Toute décision non couverte par un ADR est consignée par `node tools/sdd/adr.mjs new …` (plage ADR-2xxx).

## 9. Fichiers et composants concernés

- **Créés** — inventaire final.
- **Modifiés** — documentation, CI, déploiement.
- **Lus/réutilisés** — `evidence/SPEC-2001/test-port-map.md`, inventaire.
- **Intouchables** — `design/maquettes/`, `docs/legacy/`, oracles e2e/visuels existants, politiques RLS.

## 10. Interface et conformité visuelle

Aucun écran ni libellé ne change. Mode de validation `demo` : une page de démonstration SDD expose l'état de la spécification (propriétaires, parité, résultats) et fait l'objet d'un test `@visual`. Les tests visuels existants tournent via la façade Python contre les mêmes lignes de base (`docs/engineering/testing.md` §6) ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — La suite complète passe contre Python, cross-browser et axe compris, sans modification d'assertion.
- **CA-2** — `apps/api`, Inngest et les paquets backend retirés n'apparaissent plus dans le build ni le déploiement.
- **CA-3** — L'inventaire final montre 217 opérations, tous les événements et tâches servis par Python.
- **CA-4** — Chaque test TypeScript retiré a un équivalent pytest vert référencé.

## 12. Plan de tests

- **Unitaires** — pytest et Vitest étiquetés `[SPEC-2302]` : inventaire final et scan des dépendances. Couvre CA-1, CA-2, CA-3, CA-4.
- **Intégration** — `[SPEC-2302]` sur Supabase local, sérialisé par verrou de base : suite d'intégration complète Python. Couvre CA-1, CA-2, CA-3, CA-4.
- **E2E** — Playwright `@SPEC-2302` avec vidéo : suite complète, cross-browser. Couvre CA-1, CA-2, CA-3, CA-4.
- **Visuel** — `@SPEC-2302 @visual` sur la page de démonstration, viewport, seed et horloge figés.
- **Non-régression** — suites existantes affectées rejouées sans modification via la façade.

## 13. Preuves attendues

Dans `evidence/SPEC-2302/` : `acceptance.md` (chaque CA coché ✅ avec lien de preuve), rapports unitaires, intégration et e2e, vidéos, captures visuelles, résultats axe, et selon la spec matrice de parité, inventaire, mesures brutes. Chaque preuve indique date, environnement, commande et commit ; aucune valeur théorique présentée comme mesure.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7 : lint, typecheck, build (TypeScript et Python), tests unitaires et d'intégration `[SPEC-2302]`, e2e `@SPEC-2302` avec vidéo, au moins un test `@visual`, tous les CA prouvés, aucune régression. `node tools/sdd/validate.mjs SPEC-2302` puis `complete.mjs SPEC-2302`. Une dépendance externe réellement inaccessible est consignée par `fail.mjs SPEC-2302 "raison" --external` sans fausse preuve.

## 15. Décisions et hypothèses

- ADR applicables : ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-2011, ADR-0017, ADR-1002, ADR-2006.
- ADR-2006 et ADR-2008 ; ADR-1002 et ADR-0017 sont marqués remplacés à la clôture.
- Hors périmètre : refonte visuelle ou fonctionnelle, changement de schéma sans ADR, clients mobiles, specs gelées par ADR-2001.
