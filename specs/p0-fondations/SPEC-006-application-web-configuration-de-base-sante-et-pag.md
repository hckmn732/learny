---
id: SPEC-006
title: "Application web : configuration de base, santé et pages de démonstration"
phase: P0
priority: V1
depends_on: [SPEC-001]
business_rules: [BR-PLA-04]
screens: []
adrs: [ADR-0004, ADR-0049, ADR-0203]
visual: demo
---

# SPEC-006 — Application web : configuration de base, santé et pages de démonstration

## 1. Objectif

Compléter l'application Next.js minimale de SPEC-001 avec une configuration de base vérifiable, une route de santé exploitable, la protection des pages SDD, un client API typé minimal et des pages d'erreur. La santé publique doit permettre de distinguer un processus vivant d'une base indisponible sans exposer de secret.

## 2. Contexte

SPEC-001 crée `apps/web`, son layout, `GET /api/v1/health` minimal et la première démonstration. `docs/architecture/overview.md` §2–§4 place les routes API dans Next.js ; `docs/architecture/api.md` §1–§2 définit les réponses et l'exception d'authentification pour `/health`. Lire `docs/engineering/conventions.md` §4–§9, `docs/product/screens.md` §2, ADR-0004, ADR-0049 et ADR-0203. SPEC-003 fournit le contenu de progression de l'index SDD si elle est déjà exécutée ; cette spécification en fournit la route et le garde d'accès dans les deux ordres de réalisation.

## 3. Dépendances

- **SPEC-001** : application Next.js, `@learny/core` et `@learny/config`, page d'accueil, route de santé, registre et `sddPagesEnabled()`.
- **Base** : SPEC-101 n'est pas encore une dépendance. La sonde de base accepte un adaptateur injectable ; avant SPEC-101, le résultat est `not_configured`, jamais un faux `ok`. SPEC-101 branchera le client réel.
- **Système** : variables de build `APP_VERSION` et `GIT_COMMIT` facultatives en local, définies au déploiement ; aucune commande Git n'est lancée à chaque requête.

## 4. Règles métier couvertes

- **BR-PLA-04** : les régions déclarées par `@learny/config` restent en UE ; la réponse de santé et les pages SDD ne rendent aucune donnée utilisateur ni secret et ne demandent pas de transfert vers un service hors UE. Les tests vérifient les régions configurées et l'absence de valeurs sensibles dans la réponse.

## 5. Exigences fonctionnelles

- **EF-1** — `GET /api/v1/health` répond en JSON non mis en cache avec `status`, `version`, `commit`, `database`. `status='ok'` si le processus et la sonde base sont opérationnels ; `status='degraded'` si la base est indisponible ou non configurée. `database` vaut `ok`, `unavailable` ou `not_configured`. Une base indisponible donne HTTP 503 ; une base non configurée en local donne 200 avec `degraded`, pour permettre l'amorçage avant SPEC-101.
- **EF-2** — `version` provient du build (`APP_VERSION`) avec repli explicite `dev` en local ; `commit` provient de `GIT_COMMIT` avec repli `unknown`. Aucun nom d'hôte, chaîne de connexion, identifiant de compte, URL signée ou message brut d'exception n'est rendu.
- **EF-3** — `/_dev/sdd` et `/_dev/sdd/[specId]` sont accessibles seulement quand `ENABLE_SDD_PAGES` vaut exactement `true` et `APP_ENV` n'est pas `production`. Sinon chacune répond 404. Une entrée inconnue ou mal formée répond aussi 404. L'index affiche un état minimal si SPEC-003 n'a pas encore livré la progression, puis conserve le tableau de progression lorsqu'il existe (ADR-0203).
- **EF-4** — Le registre de démonstration est incrémental : une spécification peut ajouter son entrée sans effacer les précédentes. La page d'index relie uniquement les identifiants enregistrés ; les routes de démonstration ne sont jamais indexées par les moteurs de recherche.
- **EF-5** — `apps/web/lib/api-client.ts` offre un appel typé `apiFetch<TInput,TOutput>` : méthode, chemin `/api/v1`, corps JSON validé par le schéma transmis, session navigateur en cookie, décodage de succès et de `application/problem+json`, `requestId` conservé dans les erreurs. Un statut 204 ne tente pas de décoder JSON.
- **EF-6** — Les pages `error.tsx`, `global-error.tsx`, `not-found.tsx` et `loading.tsx` affichent un message français, un bouton « Réessayer » quand pertinent et un lien de retour. Les erreurs inattendues n'affichent ni pile ni détail interne ; `requestId` est affiché si fourni.
- **EF-7** — Le layout racine conserve `lang="fr"`, les métadonnées Learny et les polices prévues ; `html` et `body` n'introduisent pas de défilement horizontal à 390 px. Les textes sont centralisés dans `apps/web/messages/fr.ts`.

## 6. Exigences techniques

- **ET-1** — Route `apps/web/app/api/v1/health/route.ts` : `export const dynamic = 'force-dynamic'`, `Cache-Control: no-store`, `Content-Type: application/json; charset=utf-8`; sonde de base avec délai borné et résultat typé. Le service de sonde ne reçoit que la capacité de requête, sans chaîne de connexion dans son retour.
- **ET-2** — `HealthResponse` dans `packages/contracts/src/health.ts` est validé par Zod avant sérialisation. Les champs `status`, `database`, `version`, `commit` sont obligatoires ; l'ajout futur de champs est permis, la suppression de `status` ne l'est pas.
- **ET-3** — `sddPagesEnabled(env)` de SPEC-001 est la seule fonction de garde. L'index l'appelle avant la lecture du catalogue ; la route dynamique vérifie aussi la présence de l'ID dans le registre. Les pages portent `robots: { index: false, follow: false }` et ne sont pas liées depuis l'application en production.
- **ET-4** — Le client API utilise `fetch` avec `credentials: 'same-origin'`, `Accept: application/json`, `Content-Type: application/json` seulement quand un corps JSON existe ; il ne réessaie pas automatiquement une mutation. Il mappe une réponse d'erreur vers `AppError` sans réécrire le code métier.
- **ET-5** — Les pages d'erreur client ne consignent que le `requestId` et un code sûr via le logger ; le détail de l'exception demeure côté serveur. `global-error.tsx` inclut ses propres balises `html` et `body` selon App Router.
- **ET-6** — La configuration serveur n'exporte aucune variable non `NEXT_PUBLIC_*` vers un composant client. `BR-PLA-04` est testée contre `HOSTING_REGIONS` de SPEC-001.

## 7. Comportements attendus et cas limites

- **CL-1** — Sonde de base qui dépasse son délai : HTTP 503, `database='unavailable'`, sans message de connexion.
- **CL-2** — Base non encore configurée avant SPEC-101 : `database='not_configured'`, `status='degraded'`, HTTP 200 ; pas de requête fictive.
- **CL-3** — `POST /api/v1/health` : 405 ; `GET` ne requiert aucune session.
- **CL-4** — `ENABLE_SDD_PAGES='TRUE'`, `1`, vide ou absent : 404 ; `APP_ENV=production` et `ENABLE_SDD_PAGES=true` : 404.
- **CL-5** — ID SDD inconnu ou chemin mal formé : 404 et aucune lecture de fichier construite à partir de l'ID non validé.
- **CL-6** — API 204 : valeur vide typée ; corps JSON invalide ou erreur réseau : `AppError` contrôlée avec `requestId` s'il existe.
- **CL-7** — Exception dans un composant de page : page d'erreur, bouton « Réessayer » et aucune pile dans le HTML ou la console navigateur.
- **CL-8** — SPEC-003 exécutée avant/après SPEC-006 : l'index final conserve le tableau de progression et le garde production, sans supprimer une entrée du registre.

## 8. Instructions d'implémentation

1. Extraire la sonde de santé dans `apps/web/lib/health.ts`, définir `HealthResponse`, compléter la route et tester les trois états de base avec une sonde injectée. Commit `feat(SPEC-006): enrichit la route de santé`.
2. Centraliser le garde SDD, protéger l'index et la route dynamique, assurer les métadonnées `noindex` et l'ajout incrémental des démonstrations. Préserver le contenu de SPEC-003 s'il existe. Commit `feat(SPEC-006): protège les pages de démonstration`.
3. Créer le client API typé, les erreurs sûres et les pages système ; ajouter les textes au fichier de messages. Commit `feat(SPEC-006): ajoute le client API et les pages système`.
4. Écrire les tests de la section 12, dont le scénario avec SPEC-003 présent/absent. Commit `test(SPEC-006): vérifie santé erreurs et garde SDD`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-006`, consigner les preuves réelles et terminer la spécification.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/health.ts`, `apps/web/lib/health.ts`, `apps/web/lib/api-client.ts`, `apps/web/lib/api-client.test.ts`, `apps/web/app/error.tsx`, `apps/web/app/global-error.tsx`, `apps/web/app/not-found.tsx`, `apps/web/app/loading.tsx`, `apps/web/e2e/specs/p0/spec-006.spec.ts`, `apps/web/test/integration/health.test.ts`.
- **Modifiés** : `apps/web/app/api/v1/health/route.ts`, `apps/web/app/%5Fdev/sdd/page.tsx` si elle existe déjà, `apps/web/app/%5Fdev/sdd/[specId]/page.tsx`, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/app/layout.tsx`, `apps/web/messages/fr.ts`, `packages/contracts/src/index.ts`.
- **Lus / réutilisés** : `apps/web/lib/sdd-pages.ts`, `@learny/config/HOSTING_REGIONS`, `@learny/core/AppError`, `tools/sdd/lib.mjs`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-006` montre « Santé de l'application » avec les quatre champs publics, un état de sonde simulée `ok`/`unavailable`/`not_configured`, puis « Pages de démonstration » avec état du garde et « Client API » avec un exemple de succès et d'erreur `problem+json`. Les contrôles portent `data-testid="spec-006-health"`, `spec-006-sdd`, `spec-006-client`. Les états sont annoncés en texte et `aria-live`; aucun secret ni donnée personnelle ne figure dans la démonstration.

À 390 px, les cartes se superposent. Tester les jetons, l'ordre, axe et `toHaveScreenshot('spec-006-demo.png', { maxDiffPixelRatio: 0.01 })`. Une capture de la page d'erreur vérifie l'absence de pile et la présence de « Réessayer ».

## 11. Critères d'acceptation

- **CA-1** — La route de santé renvoie les quatre champs typés, sans cache, avec les réponses 200/503 prescrites pour base saine, non configurée ou indisponible.
- **CA-2** — Les pages SDD et l'index répondent 404 hors garde, y compris en production ; un ID non enregistré répond 404.
- **CA-3** — Le client API décode 200, 204 et `problem+json`, conserve le `requestId` et ne réessaie pas une mutation.
- **CA-4** — Les pages d'erreur françaises donnent une action de reprise et ne rendent ni pile ni secret.
- **CA-5** — La démonstration et le layout passent axe, la capture desktop/mobile et le contrôle des régions UE ; l'index conserve le contenu SPEC-003 dans les deux ordres.

## 12. Plan de tests

- **Unitaires** — `apps/web/lib/api-client.test.ts`, `describe('[SPEC-006] API client')` : 200, 204, problème, JSON invalide, réseau, absence de réessai (CA-3). `apps/web/lib/health.test.ts`, `describe('[SPEC-006] health')` : statuts et absence de champ secret (CA-1, CA-5).
- **Intégration** — `apps/web/test/integration/health.test.ts`, `describe('[SPEC-006] health routes')` : requêtes HTTP GET/POST, sonde injectée saine/indisponible/non configurée, en-têtes et délais (CA-1) ; index SDD avec/ sans contenu SPEC-003, sans écrasement (CA-2, CA-5).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-006.spec.ts`, `test('inspecte la santé @SPEC-006')` : ouvrir la démonstration, vérifier les valeurs affichées et l'erreur sûre ; vidéo conservée (CA-4, CA-5). Tests de 404 avec garde désactivé et ID inconnu (CA-2).
- **Visuel** — `test('démonstration web conforme @SPEC-006 @visual')` : `expectTokens`, ordre des trois régions, axe, captures desktop/mobile à 1 % (CA-5).
- **Non-régression** — `[SPEC-001]`, `@SPEC-001`, `[SPEC-003]` et `@SPEC-003` quand SPEC-003 est déjà terminée.

| Critère | Tests |
|---|---|
| CA-1 | unitaires health ; intégration health routes |
| CA-2 | intégration index ; e2e 404 |
| CA-3 | unitaires API client |
| CA-4 | e2e erreur |
| CA-5 | unitaires health ; intégration index ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-006/` : rapports, vidéo, captures de santé et d'erreur, sortie JSON des trois états de base expurgée de tout secret, `checks.json`, `acceptance.md` lié aux tests. La preuve d'hébergement UE est la validation des constantes configurées ; elle ne prouve pas un déploiement futur.

## 14. Définition de terminé

Toutes les conditions de `docs/engineering/testing.md` §7 passent. `GET /api/v1/health` reste compatible avec SPEC-001, les pages SDD sont 404 en production et les deux ordres SPEC-003/SPEC-006 ont été vérifiés. L'absence de base réelle avant SPEC-101 est visible comme `not_configured` et jamais masquée.

## 15. Décisions et hypothèses

ADR-0004 fixe Next.js et l'API intégrée, ADR-0049 les pages de démonstration, ADR-0203 leur propriété entre SPEC-003 et SPEC-006. Le statut `not_configured` permet l'amorçage avant la base ; il est distinct de `ok` pour ne pas inventer une preuve de disponibilité.
