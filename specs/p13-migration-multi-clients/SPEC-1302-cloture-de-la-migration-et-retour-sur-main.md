---
id: SPEC-1302
title: Clôture de la migration et retour sur main
phase: P13
priority: migration
depends_on: [SPEC-1301]
business_rules: []
screens: []
adrs: [ADR-1001, ADR-1006, ADR-1002, ADR-1003, ADR-1007]
visual: demo
---

# SPEC-1302 — Clôture de la migration et retour sur `main`

## 1. Objectif

Retirer tout le code de transition, mettre la documentation et l'exploitation en conformité avec l'architecture à trois applications, et préparer la fusion de `migration` dans `main` pour que la boucle SDD reprenne la piste produit (V2) sans aucune trace de la piste dans le fonctionnement courant.

## 2. Contexte

ADR-1006 §9 : après CP-13, l'agent principal fusionne `migration` dans `main` et remet `catalog.activeTrack` à `"produit"` dans le commit de fusion. Code de transition présent à la fin de P12 : réexportations `apps/web/lib/api-client.ts` et `apps/web/lib/api/*` résiduelles, scripts `tools/migration/*` (rapport, liste de référence supprimée en SPEC-1203), mentions « transition » dans les documents. Lire ADR-1001 à ADR-1007, `docs/architecture/overview.md`, `docs/architecture/api.md`, `docs/engineering/{conventions,testing,git,sdd-process}.md`, `README.md`, `CONTRIBUTING.md`, `.env.example`.

## 3. Dépendances

- **SPEC-1301** et toutes les spécifications de la piste.
- Aucune dépendance externe.

## 4. Règles métier couvertes

Aucune règle `BR-*`.

## 5. Exigences fonctionnelles

- **EF-1** — `apps/web/lib/api-client.ts` est supprimé ; les importeurs utilisent `@learny/api-client` directement. Il ne reste dans `apps/web/lib/api/` que `relay.ts` et `server-client.ts`.
- **EF-2** — `tools/migration/` ne contient plus que `report.mjs` (conservé comme contrôle permanent, appelé par `pnpm lint` et qui échoue si un couplage réapparaît) ; les autres scripts de transition sont supprimés avec leurs tests.
- **EF-3** — Documentation à jour, sans mention de transition : `docs/architecture/overview.md` (topologie, organisation du dépôt, règles de dépendance, flux types, environnements), `docs/architecture/api.md` (emplacement de la couche HTTP, authentification, versions), `docs/engineering/conventions.md` (où placer une route, un chargeur, une logique pure), `docs/engineering/testing.md` (deux serveurs, harnais `requestApi`), `README.md` et `CONTRIBUTING.md` (démarrage local web + API).
- **EF-4** — Guide d'exploitation `docs/engineering/exploitation-api.md` : déploiement (ordre API puis web), variables, santé, journaux, rotation de `API_PROXY_SECRET` sans interruption (deux valeurs acceptées pendant la rotation : `API_PROXY_SECRET` et `API_PROXY_SECRET_PREVIOUS`), retour arrière (redéployer le couple de versions précédent).
- **EF-5** — Procédure de fin de piste écrite dans `docs/engineering/sdd-process.md` et vérifiée par un test : avec `catalog.activeTrack = "produit"` et l'état final de la piste, `next.mjs` propose l'action de la piste produit et `status.mjs` affiche les deux pistes terminées ou en cours sans erreur.
- **EF-6** — La page `/_dev/sdd/SPEC-1302` affiche la synthèse de la migration : applications (`apps/api`, `apps/web`), paquets partagés et serveur, couverture des routes, couplage du web (0), état des checkpoints CP-10 à CP-12.

## 6. Exigences techniques

- **ET-1** — Rotation du secret de proxy : `@learny/http` accepte `API_PROXY_SECRET` ou `API_PROXY_SECRET_PREVIOUS` (facultative) ; `apps/web` n'envoie que `API_PROXY_SECRET`. Tests de comparaison à temps constant pour les deux valeurs.
- **ET-2** — `pnpm lint` exécute `tools/migration/report.mjs --check` (échec si une catégorie est > 0).
- **ET-3** — `tools/sdd/test/unit/next.test.ts` gagne un cas `[SPEC-1302]` : piste `migration` terminée, `activeTrack` remis à `produit`, prochaine action = piste produit.
- **ET-4** — `CHANGELOG.md` reçoit une section « Séparation backend / frontend » (générée par `tools/sdd/changelog.mjs` si applicable, sinon écrite à la main au même format).
- **ET-5** — Les mentions de `apps/worker` disparaissent du dépôt hors historique (`docs/legacy/`, `docs/adr/` et `evidence/` exclus de la recherche).

## 7. Comportements attendus et cas limites

- **CL-1** — Rotation du secret : requêtes signées avec l'ancien secret acceptées tant que `API_PROXY_SECRET_PREVIOUS` est défini, refusées (traitées comme sans secret) ensuite.
- **CL-2** — Un import résiduel de `apps/web/lib/api-client` → échec de typecheck.
- **CL-3** — Couplage réintroduit plus tard sur `main` → `pnpm lint` échoue via `report.mjs --check`.
- **CL-4** — Fusion de `migration` dans `main` avec des conflits de suivi → résolus par `node tools/sdd/sync-main.mjs` exécuté dans l'autre sens (procédure documentée, mêmes règles d'ADR-1006 §4).

## 8. Instructions d'implémentation

1. Fusionner `main` (`sync-main.mjs`).
2. Supprimer le code de transition, mettre à jour les importeurs. Commit `refactor(SPEC-1302): retire le code de transition`.
3. Rotation du secret et contrôle permanent du couplage. Commit `feat(SPEC-1302): permet la rotation du secret de proxy`.
4. Documentation et guide d'exploitation. Commit `docs(SPEC-1302): documente l'architecture à trois applications`.
5. Test de fin de piste, `CHANGELOG.md`, démonstration, e2e, visuel ; `validate.mjs` ; `complete.mjs`. L'agent n'effectue **pas** la fusion dans `main` : elle suit CP-13 (ADR-1006 §9).

## 9. Fichiers et composants concernés

- **Créés** : `docs/engineering/exploitation-api.md`, `apps/web/components/sdd-demos/spec-1302.tsx`, `apps/web/e2e/specs/p13/spec-1302.spec.ts`.
- **Supprimés** : `apps/web/lib/api-client.ts`, réexportations de `apps/web/lib/api/`, scripts de transition de `tools/migration/` (sauf `report.mjs`).
- **Modifiés** : `docs/architecture/{overview,api}.md`, `docs/engineering/{conventions,testing,sdd-process,git}.md`, `README.md`, `CONTRIBUTING.md`, `.env.example`, `CHANGELOG.md`, `packages/http/src/security.ts`, `packages/config/src/server.ts`, `package.json`, `tools/migration/report.mjs`, `tools/sdd/test/unit/next.test.ts`, `apps/web/app/%5Fdev/sdd/registry.ts`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-1302` : `h1` « Migration terminée » ; tableau `data-testid="spec-1302-apps"` ; tableau `spec-1302-packages` (« Paquet », « Rôle : partagé/serveur ») ; cartes `spec-1302-routes` (couverture) et `spec-1302-coupling` (0) ; liste `spec-1302-checkpoints` (CP-10, CP-11, CP-12 : réussi). Contrôles : jetons, structure, axe, captures desktop et mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Aucun code de transition ne subsiste (fichiers d'EF-1 et EF-2 absents, typecheck vert).
- **CA-2** — `pnpm lint` échoue si un fichier du web importe un paquet serveur (test avec un fichier temporaire).
- **CA-3** — La rotation du secret de proxy accepte les deux valeurs pendant la rotation et seulement la nouvelle ensuite.
- **CA-4** — Le test de fin de piste passe : avec `activeTrack = "produit"`, `next.mjs` propose la piste produit.
- **CA-5** — La recherche de `apps/worker` hors historique ne renvoie rien et la démonstration affiche la synthèse complète.

## 12. Plan de tests

- **Unitaires** — `packages/http/src/security.test.ts`, `describe('[SPEC-1302] proxy secret rotation')` (CA-3) ; `tools/sdd/test/unit/next.test.ts`, cas `[SPEC-1302]` (CA-4) ; `tools/migration/test/unit/report.test.ts`, `describe('[SPEC-1302] permanent coupling check')` (CA-2) ; test de recherche `apps/worker` (CA-5).
- **Intégration** — `apps/api/test/integration/proxy-trust.test.ts` (cas `[SPEC-1302]` : rotation au travers du relai) (CA-3) ; typecheck et lint complets (CA-1).
- **End-to-end** — `apps/web/e2e/specs/p13/spec-1302.spec.ts`, `test('affiche la synthèse de la migration @SPEC-1302')` (CA-5), vidéo ; suite complète.
- **Visuel** — `test('démonstration de fin de migration @SPEC-1302 @visual')` (CA-5).
- **Non-régression** — `pnpm test:e2e` complet, cross-browser, `pnpm test:perf`, `[SPEC-003]`.

| Critère | Tests |
|---|---|
| CA-1 | typecheck ; lint |
| CA-2 | unitaire contrôle permanent |
| CA-3 | unitaire rotation ; intégration relai |
| CA-4 | unitaire fin de piste |
| CA-5 | unitaire recherche ; e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1302/` : rapports, vidéo, captures, sortie de `report.mjs --check`, sortie du test de fin de piste, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes, plus : CP-13 exécutable ; la fusion dans `main` est préparée mais non effectuée par la spécification.

## 15. Décisions et hypothèses

ADR-1006 §9 (fin de piste), ADR-1001 à ADR-1007. Décision : `report.mjs --check` reste comme garde-fou permanent pour empêcher la réintroduction d'un couplage après la migration. Aucune question ouverte.
