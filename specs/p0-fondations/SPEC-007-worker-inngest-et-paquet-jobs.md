---
id: SPEC-007
title: Worker Inngest et paquet jobs
phase: P0
priority: V1
depends_on: [SPEC-001]
business_rules: []
screens: []
adrs: [ADR-0017]
visual: demo
---

# SPEC-007 — Worker Inngest et paquet jobs

## 1. Objectif

Créer un seul catalogue de fonctions Inngest réutilisé par l'application web et le worker Hono, avec une fonction de démonstration à étapes idempotentes. Poser les contrats de reprise et de test dont SPEC-203 se servira pour les événements métier et les crons.

## 2. Contexte

`docs/architecture/overview.md` §2–§5 définit le flux des jobs, les deux points d'entrée et le futur catalogue d'événements. ADR-0017 choisit Inngest, `step.run` idempotent et trois reprises avec backoff. SPEC-001 fournit le monorepo, Next.js et le harnais de test. À ce stade, aucune fonction métier de SPEC-203, ingestion ou notification n'est attendue ; la démonstration exerce seulement l'infrastructure. Lire aussi `docs/engineering/conventions.md` §3, §6–§9 et `docs/engineering/testing.md` §1–§3.

## 3. Dépendances

- **SPEC-001** : `apps/web`, Node 24, TypeScript strict, scripts `build`, `lint`, `typecheck`, Vitest et Playwright.
- **Bibliothèques** : `inngest` SDK 3 ou version stable compatible ; `hono` pour `apps/worker`. Les versions installées sont figées dans `pnpm-lock.yaml`.
- **Service externe** : Inngest Dev Server pour l'essai HTTP local. Les tests unitaires et d'intégration appellent directement les fonctions avec un adaptateur simulé ; ils n'utilisent pas Inngest Cloud. L'absence du service local ne rend pas une preuve HTTP réussie.

## 4. Règles métier couvertes

Aucune règle produit `BR-*`. Cette spécification applique ADR-0017 : fonctions communes, étapes durables, reprises et deux modes d'hébergement.

## 5. Exigences fonctionnelles

- **EF-1** — `@learny/jobs` exporte un client Inngest nommé `learny`, un registre de fonctions et un catalogue d'événements typé. Les deux hôtes importent exactement le même registre ; aucune fonction n'est dupliquée dans `apps/web` ou `apps/worker`.
- **EF-2** — `POST /api/inngest` et les méthodes attendues par l'adaptateur Inngest répondent selon son protocole, sans session utilisateur. La route ne fournit pas d'API métier publique ; les clés de signature restent côté serveur. En mode test, la vérification de signature est remplacée par l'adaptateur contrôlé du harnais, jamais désactivée en production.
- **EF-3** — `apps/worker` démarre un serveur Hono sur `PORT` (défaut local explicite), expose `GET /health` et sert le même adaptateur Inngest à `/api/inngest`. `GET /health` n'inclut que `status`, `version` et `commit` sûrs ; la construction du worker réussit dans le monorepo.
- **EF-4** — Une fonction `sdd/demo-job` accepte `{ runId, value }`, exécute deux étapes nommées (`validate-input`, `persist-result`) et retourne `{ runId, doubledValue }`. Le stockage de démonstration est un adaptateur injecté, non une table fictive ; `persist-result` est idempotente sur `runId`.
- **EF-5** — En cas d'erreur transitoire dans une étape, la fonction reprend au plus trois fois avec le backoff ADR-0017 ; une étape déjà terminée n'est pas réexécutée. Une erreur permanente est visible dans le résultat de test et dans les journaux sûrs, sans contenu d'entrée sensible.
- **EF-6** — La page `/_dev/sdd/SPEC-007` permet de lancer le job de démonstration en environnement SDD, affiche l'identifiant, les deux étapes et leur état, puis le résultat calculé. Les données d'exemple sont fixes et ne touchent aucune donnée utilisateur.

## 6. Exigences techniques

- **ET-1** — `packages/jobs/src/client.ts` instancie Inngest une seule fois ; `packages/jobs/src/functions/index.ts` exporte `functions` ; `packages/jobs/src/events.ts` contient les schémas d'événement. `packages/jobs/src/index.ts` est l'API publique du paquet.
- **ET-2** — `apps/web/app/api/inngest/route.ts` utilise l'adaptateur Next.js du SDK ; `apps/worker/src/server.ts` utilise l'adaptateur Hono. Les deux reçoivent `client` et `functions` de `@learny/jobs`.
- **ET-3** — La fonction de démonstration a une entrée Zod avec `runId` non vide et `value` entier borné ; elle valide l'entrée avant la première étape. La clé d'idempotence est `runId`; une seconde livraison avec le même `runId` et la même valeur retourne le résultat stocké, avec une valeur différente elle échoue en conflit.
- **ET-4** — Les accès externes (stockage, transport) passent par des interfaces injectées. Le test d'intégration utilise un stockage mémoire qui compte les écritures ; le job réel pourra employer une base après SPEC-101 sans changement de signature publique.
- **ET-5** — Les étapes sont nommées de manière stable pour que la reprise Inngest reconnaisse leur résultat ; ne pas inclure de valeur utilisateur dans le nom de l'étape. Les erreurs métier ne sont pas reprises comme les erreurs transitoires.
- **ET-6** — `apps/worker` possède ses scripts `dev`, `build`, `start`, `lint`, `typecheck`; `turbo.json` inclut sa construction. Le worker n'importe pas `apps/web`.

## 7. Comportements attendus et cas limites

- **CL-1** — Événement sans `runId` ou `value` hors bornes : rejet de validation avant `persist-result`, aucune écriture.
- **CL-2** — Même `runId` reçu deux fois : une seule écriture et même résultat ; `runId` réutilisé avec autre valeur : conflit explicite.
- **CL-3** — Échec transitoire après `validate-input` : seule l'étape suivante est rejouée ; trois reprises au maximum.
- **CL-4** — Échec permanent : statut d'échec consultable, sans boucle infinie ni résultat inventé.
- **CL-5** — Inngest Dev Server indisponible : test direct des handlers possible, essai HTTP local en échec signalé ; aucun appel à Inngest Cloud en mode test.
- **CL-6** — Signature de webhook absente ou invalide en production : requête refusée sans exécuter de fonction.
- **CL-7** — `PORT` occupé : le worker quitte avec erreur lisible, sans lancer une deuxième instance partielle.

## 8. Instructions d'implémentation

1. Créer `packages/jobs` avec client, schémas d'événement, registre et README ; installer Inngest. Commit `build(SPEC-007): crée le paquet jobs`.
2. Écrire le job de démonstration avec stockage injectable, idempotence et deux `step.run` ; tester directement le handler, les doublons et les reprises. Commit `feat(SPEC-007): ajoute un job durable de démonstration`.
3. Ajouter la route Next.js puis `apps/worker` Hono et sa route de santé ; brancher le même registre et construire les deux hôtes. Commit `feat(SPEC-007): sert les jobs dans web et worker`.
4. Ajouter la page SDD, les tests HTTP, e2e et visuels. Commit `test(SPEC-007): vérifie les deux hôtes et la reprise`.
5. Exécuter `validate.mjs`, renseigner les CA avec les rapports observés, terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/jobs/package.json`, `packages/jobs/README.md`, `packages/jobs/tsconfig.json`, `packages/jobs/src/index.ts`, `packages/jobs/src/client.ts`, `packages/jobs/src/events.ts`, `packages/jobs/src/functions/index.ts`, `packages/jobs/src/functions/demo-job.ts`, `packages/jobs/src/functions/demo-job.test.ts`, `packages/jobs/test/integration/demo-job.test.ts`, `apps/web/app/api/inngest/route.ts`, `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/server.ts`, `apps/worker/test/integration/server.test.ts`, `apps/web/components/sdd-demos/spec-007.tsx`, `apps/web/e2e/specs/p0/spec-007.spec.ts`.
- **Modifiés** : `package.json`, `pnpm-lock.yaml`, `turbo.json`, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/core` (horloge et erreurs), configuration SDD de SPEC-001, adaptateurs officiels du SDK verrouillé.

## 10. Interface et conformité visuelle

Mode `demo` : page `/_dev/sdd/SPEC-007` avec `h1` « Jobs durables », carte « Hôtes » (web, worker), formulaire de lancement rempli avec `runId` et `value` factices, liste ordonnée des étapes et carte « Résultat ». `data-testid` : `spec-007-hosts`, `spec-007-run`, `spec-007-steps`, `spec-007-result`. Le bouton est désactivé pendant le traitement, la liste annonce « En attente », « En cours », « Terminée » ou « Échec » en texte et `aria-live`. L'erreur n'expose aucun détail de transport ou secret.

Contrôles visuels : `expectTokens`, ordre des quatre régions, axe, capture `toHaveScreenshot('spec-007-demo.png', { maxDiffPixelRatio: 0.01 })` à 1440×900 et 390×844. La page affiche le résultat réel du job simulé, pas une valeur codée dans le composant.

## 11. Critères d'acceptation

- **CA-1** — Les deux points d'entrée utilisent le même registre de fonctions et répondent à leur contrôle de santé/protocole sans exposer de clé.
- **CA-2** — Le job de démonstration exécute deux étapes et retourne le double de la valeur ; un doublon de `runId` n'écrit qu'une fois.
- **CA-3** — Une erreur transitoire après la première étape ne la rejoue pas et s'arrête après trois reprises au plus ; une erreur permanente ne reprend pas.
- **CA-4** — En production, une requête Inngest à signature invalide est refusée avant le job.
- **CA-5** — La page SDD affiche les états et le résultat réel, passe axe et la comparaison de non-régression desktop/mobile ; sa vidéo est conservée.

## 12. Plan de tests

- **Unitaires** — `packages/jobs/src/functions/demo-job.test.ts`, `describe('[SPEC-007] demo job')` : schéma d'entrée, étapes et sortie, idempotence, conflit, reprise transitoire/permanente (CA-2, CA-3).
- **Intégration** — `packages/jobs/test/integration/demo-job.test.ts`, `describe('[SPEC-007] Inngest function')` : adaptateur simulé, compteur d'écritures et réexécution ; `apps/worker/test/integration/server.test.ts`, `describe('[SPEC-007] worker')` : santé, registre partagé et signature invalide (CA-1, CA-4).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-007.spec.ts`, `test('exécute un job SDD @SPEC-007')` : lancer la valeur 4, attendre les deux étapes, lire 8 et conserver la vidéo (CA-2, CA-5).
- **Visuel** — `test('démonstration des jobs conforme @SPEC-007 @visual')` : structure, jetons, axe, captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-001]` et `@SPEC-001`.

| Critère | Tests |
|---|---|
| CA-1 | intégration worker |
| CA-2 | unitaires ; intégration job ; e2e |
| CA-3 | unitaires ; intégration job |
| CA-4 | intégration worker |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-007/` contient rapports, vidéo du job, captures des étapes et du résultat, preuve de la requête rejetée, `checks.json` et `acceptance.md` lié aux tests. Le résumé distingue l'exécution directe simulée d'un essai avec Inngest Dev Server.

## 14. Définition de terminé

Les conditions de `docs/engineering/testing.md` §7 passent. Le build du web et du worker est vert, les hôtes importent le même registre, les doublons ne produisent pas deux écritures et aucune clé de signature n'apparaît dans le navigateur ou les preuves.

## 15. Décisions et hypothèses

ADR-0017 fixe Inngest, les deux hôtes et les trois reprises. Le stockage mémoire du job SDD est uniquement un adaptateur de test ; il ne représente pas un stockage produit. Les événements et crons métier seront ajoutés par SPEC-203.
