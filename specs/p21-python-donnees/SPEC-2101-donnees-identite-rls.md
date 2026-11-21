---
id: SPEC-2101
title: Connexion PostgreSQL, identité, RLS et Storage en Python
phase: P21
priority: migration
depends_on: [SPEC-2002, SPEC-2003]
business_rules: [BR-PLA-04, BR-PLA-08]
screens: []
adrs: [ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-0022, ADR-1005, ADR-1009, ADR-2010]
visual: demo
---

# SPEC-2101 — Connexion PostgreSQL, identité, RLS et Storage en Python

## 1. Objectif

Donner au Python un accès aux données strictement équivalent au TypeScript : mêmes identités, mêmes politiques RLS, mêmes privilèges.

## 2. Contexte

Le TypeScript vérifie les jetons localement (ADR-1009), accepte cookie relayé et Bearer (ADR-1005) et exécute ses requêtes sous RLS (ADR-0022) avec un `serviceDb` privilégié pour des cas listés.

État de départ : branche `main` (ADR-2001) ; le web est un client pur de l'API Hono `apps/api` (217 opérations). Références : `docs/architecture/python-headless-migration/` (audit 01–15), `docs/product/business-rules.md`, `docs/architecture/{overview,data-model,api,ai}.md`, `docs/engineering/{conventions,testing,git}.md` et les ADR de la section 15. Invariant (ADR-1001, ADR-2008) : aucun changement fonctionnel visible, aucune assertion d'oracle modifiée, aucune ligne de base visuelle régénérée.

## 3. Dépendances

- **SPEC-2002** — terminée et fusionnée dans `main`.
- **SPEC-2003** — terminée et fusionnée dans `main`.
- Supabase local (PostgreSQL, Auth, Storage) pour l'intégration ; fournisseurs externes en mode mock (ADR-0048).

## 4. Règles métier couvertes

Aucune règle nouvelle. Règles directement concernées : BR-PLA-04, BR-PLA-08. Toutes les règles `BR-*` couvertes par le code porté restent actives et leurs tests sont rejoués.

## 5. Exigences fonctionnelles

- **EF-1** — Pool de connexions et UoW (commit/rollback, outbox dans la transaction).
- **EF-2** — Vérification JWT et construction de l'ActorContext pour cookie relayé et Bearer (ADR-2010).
- **EF-3** — Application des claims et du rôle `authenticated` à chaque transaction utilisateur.
- **EF-4** — Liste fermée des cas d'usage privilégiés avec journalisation.
- **EF-5** — Adaptateur Storage (chemins propriétaires, URL signées) équivalent au TypeScript.

## 6. Exigences techniques

- **ET-1** — Budget de connexions documenté (API + worker + Supabase) et limites de pool configurables.
- **ET-2** — Délais de requête bornés ; erreurs de base converties en erreurs stables du contrat.
- **ET-3** — Aucun secret côté client ; données en UE (BR-PLA-04).

## 7. Comportements attendus et cas limites

- **CL-1** — Jeton absent, expiré, mauvais émetteur ou audience, signature invalide : refus sans accès aux données.
- **CL-2** — `userId` fourni dans le corps ou un en-tête : ignoré.
- **CL-3** — Échec en milieu de transaction : rollback complet, aucun événement d'outbox publié.
- **CL-4** — JWKS inaccessible : repli identique à ADR-1009.

## 8. Instructions d'implémentation

1. Écrire `learny.shared` (UoW, pool, horloge, erreurs) et `learny.identity.infrastructure` (JWT, JWKS).
2. Rejouer la matrice RLS existante sous Python pour toutes les tables.
3. Écrire l'adaptateur Storage et ses tests.

Commits atomiques `feat|test|refactor(SPEC-2101): …` ; chaque commit compile et passe lint, typecheck et tests unitaires. Toute décision non couverte par un ADR est consignée par `node tools/sdd/adr.mjs new …` (plage ADR-2xxx).

## 9. Fichiers et composants concernés

- **Créés** — `packages-py/learny/shared/`, `packages-py/learny/identity/infrastructure/`, tests RLS pytest.
- **Modifiés** — `api/ownership.yaml` (aucune bascule).
- **Lus/réutilisés** — `packages/db`, `packages/http`, migrations SQL, tests RLS existants.
- **Intouchables** — `design/maquettes/`, `docs/legacy/`, oracles e2e/visuels existants, politiques RLS.

## 10. Interface et conformité visuelle

Aucun écran ni libellé ne change. Mode de validation `demo` : une page de démonstration SDD expose l'état de la spécification (propriétaires, parité, résultats) et fait l'objet d'un test `@visual`. Les tests visuels existants tournent via la façade Python contre les mêmes lignes de base (`docs/engineering/testing.md` §6) ; axe sans violation serious/critical.

## 11. Critères d'acceptation

- **CA-1** — La matrice RLS (anonyme, propriétaire, autre utilisateur, membre, rôle de service) passe sous Python pour toutes les tables de l'inventaire.
- **CA-2** — Les tests de jetons invalides et d'identité usurpée échouent tous proprement.
- **CA-3** — Le rôle de service n'est utilisable que par la liste fermée, vérifiée par un test.

## 12. Plan de tests

- **Unitaires** — pytest et Vitest étiquetés `[SPEC-2101]` : vérification JWT, ActorContext, liste privilégiée. Couvre CA-1, CA-2, CA-3.
- **Intégration** — `[SPEC-2101]` sur Supabase local, sérialisé par verrou de base : matrice RLS, transactions, Storage, JWKS. Couvre CA-1, CA-2, CA-3.
- **E2E** — Playwright `@SPEC-2101` avec vidéo : connexion cookie et Bearer via la façade. Couvre CA-1, CA-2, CA-3.
- **Visuel** — `@SPEC-2101 @visual` sur la page de démonstration, viewport, seed et horloge figés.
- **Non-régression** — suites existantes affectées rejouées sans modification via la façade.

## 13. Preuves attendues

Dans `evidence/SPEC-2101/` : `acceptance.md` (chaque CA coché ✅ avec lien de preuve), rapports unitaires, intégration et e2e, vidéos, captures visuelles, résultats axe, et selon la spec matrice de parité, inventaire, mesures brutes. Chaque preuve indique date, environnement, commande et commit ; aucune valeur théorique présentée comme mesure.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7 : lint, typecheck, build (TypeScript et Python), tests unitaires et d'intégration `[SPEC-2101]`, e2e `@SPEC-2101` avec vidéo, au moins un test `@visual`, tous les CA prouvés, aucune régression. `node tools/sdd/validate.mjs SPEC-2101` puis `complete.mjs SPEC-2101`. Une dépendance externe réellement inaccessible est consignée par `fail.mjs SPEC-2101 "raison" --external` sans fausse preuve.

## 15. Décisions et hypothèses

- ADR applicables : ADR-1001, ADR-2001, ADR-2005, ADR-2008, ADR-0022, ADR-1005, ADR-1009, ADR-2010.
- ADR-2010.
- Hors périmètre : refonte visuelle ou fonctionnelle, changement de schéma sans ADR, clients mobiles, specs gelées par ADR-2001.
