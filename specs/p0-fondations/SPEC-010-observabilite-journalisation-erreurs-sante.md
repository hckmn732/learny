---
id: SPEC-010
title: "Observabilité : journalisation, erreurs, santé"
phase: P0
priority: V1
depends_on: [SPEC-006, SPEC-009]
business_rules: []
screens: []
adrs: [ADR-0043, ADR-0233]
visual: demo
---

# SPEC-010 — Observabilité : journalisation, erreurs, santé

## 1. Objectif

Fournir une trace structurée d'une requête, d'un job et d'une erreur, sans divulguer de donnée personnelle ni de secret. Brancher Sentry seulement quand il est configuré et enrichir la santé de SPEC-006 avec des sondes compréhensibles par l'exploitant.

## 2. Contexte

SPEC-006 crée le web, sa santé et des pages d'erreur sûres ; SPEC-009 valide les variables d'environnement. Lire `docs/architecture/overview.md` §2, §4–§6, `docs/engineering/conventions.md` §8–§9, `docs/architecture/api.md` §1, ADR-0043 et les fichiers du worker SPEC-007. Les journaux ne remplacent pas `ai_calls` (SPEC-110/507) : ils ne conservent ni prompt, ni apport, ni réponse du modèle.

## 3. Dépendances

- **SPEC-006** : route `/api/v1/health`, `AppError`, rendu d'erreur et `requestId` du client API.
- **SPEC-009** : `LOG_LEVEL`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` et modes d'environnement validés.
- **SPEC-007** (déjà en P0, sans dépendance de catalogue directe) : hôte worker et fonctions Inngest ; si son registre est présent, utiliser le même intercepteur d'erreur.
- **Bibliothèques** : `pino` pour le logger et SDK Sentry web/Node. Aucune requête Sentry n'est émise pendant les tests.

## 4. Règles métier couvertes

Aucune règle `BR-*` spécifique. L'exigence est transversale : diagnostic exploitable selon ADR-0043 et minimisation des données selon `docs/engineering/conventions.md` §8–§9.

## 5. Exigences fonctionnelles

- **EF-1** — Chaque requête API possède un `requestId` généré ou validé, renvoyé dans l'en-tête `x-request-id` et dans `application/problem+json` en cas d'erreur. Tous les journaux créés pendant la requête portent ce même identifiant.
- **EF-2** — Chaque entrée de journal est un objet JSON avec `timestamp`, `level`, `message`, `requestId` quand applicable, `userId` si connu, `route` ou `jobId`. Le niveau suit `LOG_LEVEL` ; en production, le niveau par défaut est `info`. Les valeurs d'e-mail, clé, cookie, token, corps d'apport, prompt et réponse IA sont toujours expurgées.
- **EF-3** — Une erreur métier connue est journalisée au niveau prévu par sa gravité et rend le problème HTTP de SPEC-201 ; une erreur inattendue reçoit un code sûr, un `requestId` et un événement Sentry si `SENTRY_DSN` est défini. Le navigateur ne voit jamais la pile ni le contenu de l'exception.
- **EF-4** — Les erreurs des fonctions Inngest portent `jobId`, nom de fonction, nom d'étape, tentative et `requestId` corrélé si transmis par l'événement ; le résultat de l'étape et les données utilisateur ne sont pas dans le journal.
- **EF-5** — `GET /api/v1/health` conserve les champs de SPEC-006 et ajoute l'état des composants contrôlables : base et build. Une sonde non configurée est marquée `not_configured`, une panne `unavailable` ; la route ne dépend pas de Sentry ni d'un service IA externe.
- **EF-6** — La page `/_dev/sdd/SPEC-010` présente un exemple de requête réussie, un exemple d'erreur sûre et un exemple de journal expurgé, avec leur `requestId` commun ; elle ne montre aucun vrai secret.

## 6. Exigences techniques

- **ET-1** — `packages/core/src/logger.ts` exporte `createLogger(ctx)` et une instance de base pino. Utiliser `redact` pour les chemins sensibles connus, puis une fonction de sérialisation avec liste blanche des champs d'événement ; les objets arbitraires ne sont jamais logués par défaut.
- **ET-2** — `packages/core/src/request-context.ts` expose un contexte par requête via `AsyncLocalStorage` côté Node, avec `requestId` et `userId` optionnel. Le middleware et le wrapper `handler` propagent ce contexte aux services ; les jobs reçoivent explicitement leur contexte.
- **ET-3** — L'identifiant entrant `x-request-id` n'est réutilisé que s'il respecte un format et une longueur bornés ; sinon un UUID est généré. Une valeur non fiable ne devient jamais une clé de journal brute.
- **ET-4** — Les intégrations Sentry serveur, client et worker sont désactivées quand leur DSN respectif est vide ou en environnement `test` ; filtrer `beforeSend` pour ôter `Authorization`, `Cookie`, `Set-Cookie`, query sensibles et corps de requête. Le `requestId` est un tag sûr.
- **ET-5** — Les sondes de santé ont délai borné et retournent des statuts typés, sans message brut d'exception ; le résultat n'est pas mis en cache. La route ne déclenche aucun travail long ni mutation.
- **ET-6** — Les tests capturent la sortie pino dans un flux mémoire et vérifient les octets produits ; une assertion sur le seul objet avant sérialisation ne prouve pas l'absence de fuite.

## 7. Comportements attendus et cas limites

- **CL-1** — En-tête `x-request-id` absent ou contenant des caractères de contrôle : générer un identifiant sûr et ne jamais reproduire l'entrée.
- **CL-2** — Objet d'erreur avec `password`, `apiKey` ou contenu d'apport dans plusieurs niveaux imbriqués : sortie expurgée intégralement.
- **CL-3** — Sentry indisponible : l'erreur applicative suit son chemin normal ; l'échec de télémétrie n'aggrave pas la réponse HTTP.
- **CL-4** — DSN vide : aucun client Sentry initialisé et aucune tentative réseau.
- **CL-5** — Sonde base lente ou en panne : réponse de santé bornée et `unavailable`, sans exception brute.
- **CL-6** — Deux requêtes concurrentes : leurs `requestId` et `userId` ne se mélangent pas.
- **CL-7** — Erreur de job après reprise : même `jobId`, tentative distincte et aucune double entrée prétendant un succès.

## 8. Instructions d'implémentation

1. Créer le logger pino, les sérialiseurs sûrs et les tests de non-fuite avec valeurs sentinelles. Commit `feat(SPEC-010): structure et expurge les journaux`.
2. Ajouter le contexte de requête au wrapper API et la corrélation dans le worker/jobs ; vérifier deux requêtes concurrentes. Commit `feat(SPEC-010): propage les identifiants de requête`.
3. Configurer Sentry conditionnel et le filtre `beforeSend` ; compléter la route de santé sans rompre le contrat SPEC-006. Commit `feat(SPEC-010): remonte les erreurs et enrichit la santé`.
4. Ajouter la page SDD, les tests d'intégration et navigateur, créer la ligne de base visuelle. Commit `test(SPEC-010): vérifie corrélation et non-fuite`.
5. Valider par la boucle SDD et renseigner les preuves produites.

## 9. Fichiers et composants concernés

- **Créés** : `packages/core/src/logger.ts`, `packages/core/src/logger.test.ts`, `packages/core/src/request-context.ts`, `packages/core/src/request-context.test.ts`, `apps/web/sentry.server.config.ts`, `apps/web/sentry.client.config.ts`, `apps/worker/src/sentry.ts`, `apps/web/components/sdd-demos/spec-010.tsx`, `apps/web/test/integration/observability.test.ts`, `apps/web/e2e/specs/p0/spec-010.spec.ts`.
- **Modifiés** : `packages/core/src/index.ts`, `apps/web/lib/api/handler.ts` (ou wrapper existant), `apps/web/app/api/v1/health/route.ts`, `packages/jobs/src/index.ts`, `apps/worker/src/server.ts`, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : configuration SPEC-009, `AppError`, route santé SPEC-006 et événements de SPEC-007.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-010` présente dans l'ordre « Corrélation » (requestId), « Journal expurgé » (JSON formaté avec valeurs masquées), « Erreur sûre » (code, statut, requestId) et « Santé » (états des sondes). `data-testid` : `spec-010-context`, `spec-010-log`, `spec-010-error`, `spec-010-health`. Un exemple fictif est explicitement étiqueté « Démonstration » ; aucun événement Sentry réel n'est fabriqué. Les états de panne ont une icône et un texte en plus de la couleur. À 390 px, le JSON défile horizontalement dans une région nommée. Contrôles : `expectTokens`, ordre, axe, capture `toHaveScreenshot('spec-010-demo.png', { maxDiffPixelRatio: 0.01 })`.

## 11. Critères d'acceptation

- **CA-1** — Une requête et ses journaux partagent le même `requestId` ; deux requêtes concurrentes restent isolées.
- **CA-2** — Les sorties JSON de journal et les événements Sentry filtrés ne contiennent aucune valeur des sentinelles e-mail, clé, cookie, apport ou prompt.
- **CA-3** — `SENTRY_DSN` absent n'envoie rien ; défini hors test, une erreur inattendue produit un événement sûr sans modifier la réponse utilisateur.
- **CA-4** — La santé conserve le contrat SPEC-006 et rend l'indisponibilité base avec délai borné, sans détail sensible.
- **CA-5** — La page SDD montre corrélation, expurgation, erreur et santé, passe axe, vidéo et capture desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/core/src/logger.test.ts`, `describe('[SPEC-010] logger')` : sérialisation et sentinelles imbriquées (CA-2) ; `request-context.test.ts` : identifiants concurrents et en-têtes invalides (CA-1).
- **Intégration** — `apps/web/test/integration/observability.test.ts`, `describe('[SPEC-010] observability')` : appels HTTP parallèles, capture du flux pino et du faux transport Sentry, DSN vide, panne de sonde et continuité des champs santé (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-010.spec.ts`, `test('inspecte le diagnostic @SPEC-010')` : ouvrir la démonstration, vérifier le requestId et l'erreur sûre, conserver la vidéo (CA-5).
- **Visuel** — `test('diagnostic conforme @SPEC-010 @visual')` : quatre régions, jetons, axe, captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-006]`, `[SPEC-009]`, `@SPEC-006`.

| Critère | Tests |
|---|---|
| CA-1 | `request-context.test.ts` ; intégration |
| CA-2 | `logger.test.ts` ; intégration |
| CA-3 | intégration Sentry |
| CA-4 | intégration santé |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-010/` contient les rapports de tests, des sorties JSON expurgées, le résultat de sonde injectée, les captures et la vidéo de démonstration, `checks.json` et `acceptance.md`. Les sentinelles de test et les identifiants réels de service ne sont pas conservés dans les preuves.

## 14. Définition de terminé

Les conditions de `docs/engineering/testing.md` §7 passent. Les tests inspectent la sortie sérialisée, Sentry reste inactif sans DSN et aucune route de santé n'expose de détail d'infrastructure. La corrélation fonctionne dans web et worker.

## 15. Décisions et hypothèses

ADR-0043 impose pino, requestId, Sentry conditionnel et la santé. Les champs du journal suivent la minimisation de `conventions.md` §8 ; aucune rétention nouvelle ni outil externe supplémentaire n'est introduit.

ADR-0233 précise l'entrée serveur `@learny/core/server` (pino et `AsyncLocalStorage` hors du bundle navigateur), la forme `components { database, build }` ajoutée à la santé et le chargement conditionnel du SDK Sentry.
