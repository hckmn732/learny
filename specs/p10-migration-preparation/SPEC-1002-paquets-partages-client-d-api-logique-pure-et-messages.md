---
id: SPEC-1002
title: Paquets partagés — client d'API, logique pure et messages
phase: P10
priority: migration
depends_on: [SPEC-1001]
business_rules: []
screens: []
adrs: [ADR-1007, ADR-1001, ADR-1004]
visual: demo
---

# SPEC-1002 — Paquets partagés : client d'API, logique pure et messages

## 1. Objectif

Extraire de `apps/web` et de `packages/services` ce que tous les clients (web aujourd'hui, mobile demain) doivent partager, dans trois paquets exécutables dans un navigateur, sous Node et sous React Native : `@learny/api-client`, `@learny/domain` et `@learny/i18n`. Aucun comportement visible ne change.

## 2. Contexte

ADR-1007 définit les paquets partagés et leurs dépendances autorisées. Aujourd'hui :

- le client typé de `/api/v1` vit dans `apps/web/lib/api-client.ts` (testé par `api-client.test.ts` et `api-client-routes.test.ts`) ;
- deux modules purs de `packages/services` sont importés par des composants client : `packages/services/src/home/derive.ts` (par `components/home/home-view.tsx`, `TutorActivityCard.tsx`, `WarmupCard.tsx`) et `packages/services/src/review/game-response.ts` (par `components/offline/OfflineQuizGlobal.tsx`) ;
- les messages vivent dans `apps/web/messages/fr.ts` (et `apps/web/messages/fr/`), référencés aussi par `packages/bricks/src/view/labels.ts`.

Lire : ADR-1007, `docs/architecture/overview.md` §3 (règles de dépendance), `eslint.config.mjs` (`ALLOWED_IMPORTS`), `apps/web/lib/api-client.ts`.

## 3. Dépendances

- **SPEC-1001** : règle `learny/web-is-a-client` et liste de référence (les 4 composants client couplés doivent en sortir ici).
- Aucune bibliothèque nouvelle ; `esbuild` (déjà présent) sert au contrôle de portabilité.

## 4. Règles métier couvertes

Aucune règle `BR-*` ; les fonctions déplacées gardent exactement leur comportement (mêmes tests).

## 5. Exigences fonctionnelles

- **EF-1** — `@learny/api-client` expose `createApiClient(options)` avec `options = { baseUrl: string; fetch?: typeof fetch; headers?: () => Record<string,string> | Promise<Record<string,string>>; onUnauthorized?: () => Promise<boolean> }` et les fonctions existantes (`callApi`, `api`, `apiFetch`) liées à un client par défaut de `baseUrl = '/api/v1'`. Les signatures publiques actuellement utilisées par `apps/web` ne changent pas.
- **EF-2** — `apps/web/lib/api-client.ts` devient une réexportation de `@learny/api-client` (transition, supprimée par SPEC-1302) ; tous les appels du navigateur restent identiques (même URL, mêmes en-têtes, même `Idempotency-Key`, même conversion `problem+json` → `AppError`).
- **EF-3** — `@learny/domain` contient `home/derive` et `review/game-response` (mêmes exports, mêmes noms) ; `packages/services` les importe depuis `@learny/domain` et ne les exporte plus sous `./home/derive` ni `./review/game-response` ; les 4 composants client importent `@learny/domain` et sortent de la liste de référence de SPEC-1001.
- **EF-4** — `@learny/i18n` contient les messages `fr` ; `apps/web` et `packages/bricks` les importent depuis `@learny/i18n` (`import { fr } from '@learny/i18n'`, sous-chemins conservés si existants). Le contenu est identique octet pour octet.
- **EF-5** — La page `/_dev/sdd/SPEC-1002` montre, pour chaque paquet partagé, ses dépendances autorisées et le résultat du contrôle de portabilité, puis appelle `GET /api/v1/health` **depuis le navigateur** avec `@learny/api-client` et affiche le statut reçu.

## 6. Exigences techniques

- **ET-1** — Nouveaux paquets `packages/api-client`, `packages/domain`, `packages/i18n` : `package.json` (`"type": "module"`, `exports` vers `./src/*.ts` comme les paquets existants), `tsconfig.json` étendant `tsconfig.base.json`, scripts `lint` et `typecheck`.
- **ET-2** — `eslint.config.mjs` : `ALLOWED_IMPORTS['api-client'] = ['contracts', 'core']`, `ALLOWED_IMPORTS.domain = ['contracts', 'core', 'learning-engine']`, `ALLOWED_IMPORTS.i18n = []`. Interdiction supplémentaire dans ces trois paquets : `node:*`, `next`, `next/*`, `react-dom`, et l'entrée `@learny/core/server`.
- **ET-3** — Contrôle de portabilité `tools/migration/shared-packages.test.ts` : pour chaque paquet partagé (`contracts`, `core` entrée `.`, `api-client`, `domain`, `i18n`, `learning-engine`), esbuild construit l'entrée avec `platform: 'neutral'`, `bundle: true`, `external: ['zod', 'ts-fsrs', '@date-fns/tz']` ; le test échoue si la construction échoue ou si le méta-fichier contient un module `node:*` ou un chemin `packages/(db|services|jobs|llm|tutor|ingestion|automations|notifications|http|api-routes)`.
- **ET-4** — Les tests unitaires existants des modules déplacés sont déplacés avec eux (`packages/domain/src/**`), sans modification d'assertion ; ceux de `api-client` vont dans `packages/api-client/src/*.test.ts`.
- **ET-5** — Si `packages/core/src/index.ts` réexporte un module qui importe `pino` ou `node:*`, ce module passe sous `@learny/core/server` et ses importeurs serveur sont mis à jour ; l'entrée `.` doit passer ET-3.

## 7. Comportements attendus et cas limites

- **CL-1** — Un import résiduel de `@learny/services/home/derive` dans le dépôt → échec de typecheck (sous-chemin supprimé) ; aucun alias de compatibilité.
- **CL-2** — `createApiClient` sans `fetch` → utilise `globalThis.fetch` ; absent → erreur explicite à l'appel « fetch indisponible ».
- **CL-3** — `onUnauthorized` renvoie `true` après un 401 → la requête est rejouée **une seule fois** avec de nouveaux en-têtes ; `false` → l'erreur 401 est levée telle quelle. Le web n'utilise pas cette option (comportement inchangé).
- **CL-4** — Hors ligne : le client n'ajoute aucune logique de reprise ; le comportement hors ligne du web (SPEC-801) reste celui de ses propres modules.
- **CL-5** — Message manquant dans `@learny/i18n` → échec de typecheck comme aujourd'hui (type dérivé de l'objet `fr`).

## 8. Instructions d'implémentation

1. Créer `packages/i18n` et déplacer `apps/web/messages/**` (`git mv`), mettre à jour les imports (`apps/web`, `packages/bricks`). Commit `refactor(SPEC-1002): déplace les messages dans @learny/i18n`.
2. Créer `packages/domain`, `git mv` des deux modules et de leurs tests, mettre à jour `packages/services` et les 4 composants, retirer ces composants de la liste de référence. Commit `refactor(SPEC-1002): extrait la logique pure partagée dans @learny/domain`.
3. Créer `packages/api-client` à partir de `apps/web/lib/api-client.ts` (paramétrage par `createApiClient`), réexporter depuis le web, déplacer les tests. Commit `refactor(SPEC-1002): extrait le client d'API typé`.
4. Règles ESLint, contrôle de portabilité (ET-3), correction éventuelle de `@learny/core` (ET-5). Commit `build(SPEC-1002): vérifie la portabilité des paquets partagés`.
5. Démonstration, e2e, visuel ; `validate.mjs` ; `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/api-client/{package.json,tsconfig.json,src/index.ts,src/client.ts,src/*.test.ts}`, `packages/domain/{package.json,tsconfig.json,src/index.ts,src/home/derive.ts,src/review/game-response.ts}` (déplacés), `packages/i18n/{package.json,tsconfig.json,src/index.ts,src/fr.ts,src/fr/**}` (déplacés), `tools/migration/shared-packages.test.ts`, `apps/web/components/sdd-demos/spec-1002.tsx`, `apps/web/e2e/specs/p10/spec-1002.spec.ts`.
- **Modifiés** : `apps/web/lib/api-client.ts` (réexportation), les importeurs de `messages/fr`, `apps/web/components/home/{home-view,TutorActivityCard,WarmupCard}.tsx`, `apps/web/components/offline/OfflineQuizGlobal.tsx`, `packages/services/package.json` (exports), `packages/services/src/**` (imports), `packages/bricks/src/view/labels.ts`, `eslint.config.mjs`, `tools/migration/web-boundary-baseline.json`, `apps/web/package.json`, `packages/services/package.json`, `packages/bricks/package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `apps/web/app/%5Fdev/sdd/registry.ts`.
- **Lus** : `packages/contracts/src/define-route.ts`, `packages/contracts/src/routes.ts`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-1002` : `h1` « Paquets partagés » ; tableau `data-testid="spec-1002-packages"` (colonnes « Paquet », « Dépendances autorisées », « Portable ») ; carte `spec-1002-health` avec bouton « Appeler l'API » qui affiche « Statut : ok » et l'identifiant de requête reçu, `aria-live="polite"`. Composants de `@learny/ui`. Contrôles : jetons, structure, axe, captures `spec-1002-demo.png` desktop 1440×900 et mobile 390×844 ≤ 1 % (identifiant de requête masqué dans la capture).

## 11. Critères d'acceptation

- **CA-1** — Les six paquets partagés passent le contrôle de portabilité ; un import `node:fs` ajouté à `@learny/domain` le fait échouer.
- **CA-2** — Les tests des modules déplacés passent sans modification d'assertion ; la suite unitaire complète reste verte.
- **CA-3** — Les 4 composants client ne figurent plus dans la liste de référence et le lint est vert.
- **CA-4** — `createApiClient` applique `baseUrl`, `headers` et la relance unique sur 401 (CL-3).
- **CA-5** — Les parcours e2e de l'accueil (`@SPEC-603`), du quiz global hors ligne (`@SPEC-801`) et de la démonstration passent ; la démonstration affiche « Statut : ok ».

## 12. Plan de tests

- **Unitaires** — `packages/api-client/src/client.test.ts`, `describe('[SPEC-1002] api client')` : `baseUrl`, fournisseur d'en-têtes, conversion `problem+json`, relance unique (CA-4). `tools/migration/shared-packages.test.ts`, `describe('[SPEC-1002] shared packages portability')` : six paquets, cas négatif sur un module temporaire (CA-1). Tests déplacés de `@learny/domain` et de `api-client` (CA-2), plus `describe('[SPEC-1002] boundary')` vérifiant la liste de référence (CA-3).
- **Intégration** — `apps/web/test/integration/api-client-origin.test.ts`, `describe('[SPEC-1002] web api client')` : le client par défaut du web appelle `/api/v1/health` du serveur de test et reçoit le même corps qu'avant (CA-5).
- **End-to-end** — `apps/web/e2e/specs/p10/spec-1002.spec.ts`, `test('appelle l API avec le client partagé @SPEC-1002')` : cliquer « Appeler l'API », lire « Statut : ok » (CA-5), vidéo.
- **Visuel** — `test('démonstration des paquets partagés @SPEC-1002 @visual')` (CA-5).
- **Non-régression** — `@SPEC-603`, `@SPEC-801`, `@SPEC-701`, `[SPEC-201]`, `@SPEC-302`.

| Critère | Tests |
|---|---|
| CA-1 | unitaire portabilité |
| CA-2 | unitaires déplacés ; suite unitaire |
| CA-3 | unitaire frontière ; lint |
| CA-4 | unitaire client |
| CA-5 | intégration ; e2e ; `@visual` ; non-régression |

## 13. Preuves attendues

`evidence/SPEC-1002/` : rapports, vidéo, captures, sortie du contrôle de portabilité (avec le cas négatif), diff de la liste de référence, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes (`docs/engineering/testing.md` §7), plus : aucun alias de compatibilité vers les anciens sous-chemins de `@learny/services`, et la taille du JavaScript initial de chaque page reste dans le budget ADR-0332.

## 15. Décisions et hypothèses

ADR-1007 fixe noms, contenus et dépendances. Hypothèse : `apps/web/messages` ne contient que des données (aucune fonction dépendant de Next). Aucune question ouverte.
