---
id: SPEC-012
title: Images Docker et déploiement auto-hébergé
phase: P0
priority: V1
depends_on: [SPEC-007, SPEC-008]
business_rules: []
screens: []
adrs: [ADR-0053]
visual: demo
---

# SPEC-012 — Images Docker et déploiement auto-hébergé

## 1. Objectif

Construire deux images reproductibles, `web` et `worker`, puis un Compose d'auto-hébergement comprenant Supabase et Inngest. Donner une procédure d'installation et de mise à jour qui permet de vérifier la santé de la pile sans confondre ce mode avec la production gérée choisie en V1.

## 2. Contexte

ADR-0053 réserve Docker au développement local et à l'auto-hébergement, tandis que la production V1 utilise des services gérés. SPEC-007 livre le worker Hono et le registre Inngest ; SPEC-008 livre la configuration locale et les extensions. Lire `docs/architecture/overview.md` §2, §3 et §6, `docs/engineering/conventions.md` §7–§9, `docs/engineering/testing.md` §1 et §7, `.env.example`. Les composants Supabase/Inngest auto-hébergés suivent les exemples officiels vendus avec leurs versions verrouillées dans la documentation d'installation, sans incorporer de clé réelle au dépôt.

## 3. Dépendances

- **SPEC-007** : `apps/worker` expose `/health` et sert le registre partagé à `/api/inngest`.
- **SPEC-008** : extensions Postgres, scripts de vérification et connaissance des ports.
- **Système** : Docker Engine/Compose et accès aux images au moment de l'installation. Si Docker ou le registre d'images est indisponible, les Dockerfiles et Compose sont rédigés et contrôlés statiquement, puis le test de démarrage est consigné comme blocage externe ; aucun démarrage n'est inventé.

## 4. Règles métier couvertes

Aucune règle `BR-*` produit. Les règles de confidentialité et d'hébergement s'appliquent au déployeur : les exemples ne contiennent pas de secret, et les régions de production gérée restent gouvernées par BR-PLA-04 et SPEC-013.

## 5. Exigences fonctionnelles

- **EF-1** — `docker build -f docker/web.Dockerfile` produit une image Next.js `standalone` qui démarre sans dépendances de développement, sous utilisateur non root. `docker/worker.Dockerfile` produit une image Node du worker avec les mêmes restrictions.
- **EF-2** — `docker/compose.selfhost.yml` déclare web, worker, Postgres/Supabase Auth/Storage/API et Inngest auto-hébergé, les réseaux et volumes persistants nécessaires, contrôles de santé et ordre de démarrage. Mailpit est optionnel via profil local ; un transport e-mail de production doit être configuré avant exposition publique.
- **EF-3** — Les deux images utilisent le même commit du monorepo et acceptent les variables validées par SPEC-009. L'image web ne reçoit au build que les variables publiques nécessaires ; les secrets sont fournis à l'exécution et jamais inscrits en couche d'image ou dans un journal de build.
- **EF-4** — Un opérateur suit `docs/operations/self-hosting.md` pour copier `.env.example` vers un fichier non versionné, générer les secrets, démarrer la pile, appliquer les migrations, contrôler la santé et mettre à jour les images sans perte de volumes.
- **EF-5** — Les contrôles de santé vérifient l'API web, le worker, la base et Inngest ; le Compose refuse de présenter `web` comme sain si ses dépendances obligatoires sont indisponibles. Un redémarrage conserve les données.
- **EF-6** — La page `/_dev/sdd/SPEC-012` affiche les composants du Compose, l'état réel de construction et les contrôles de santé disponibles ; elle ne lance pas Docker depuis le navigateur ni ne révèle des variables d'environnement.

## 6. Exigences techniques

- **ET-1** — Dockerfiles multi-étapes : installation avec `pnpm-lock.yaml` et `--frozen-lockfile`, build ciblé, image d'exécution minimale, `USER` non root, répertoire de travail non inscriptible sauf zones nécessaires. Copier uniquement la sortie standalone, les assets publics et les fichiers de runtime requis.
- **ET-2** — `apps/web/next.config.ts` active `output: 'standalone'` sans casser la construction gérée de SPEC-013. L'URL de santé pour l'image web est `/api/v1/health` ; le worker utilise `/health`.
- **ET-3** — Le Compose n'expose que les ports d'accès requis par l'opérateur ; Postgres interne, clés service et interfaces d'administration ne sont pas exposés sans configuration explicite. Les volumes de base et stockage sont nommés et ne sont jamais détruits par la commande d'arrêt documentaire.
- **ET-4** — Les images de services tiers portent des tags de version explicitement épinglés ; le document explique la mise à jour coordonnée des versions et la sauvegarde des données avant migration.
- **ET-5** — Les variables sensibles proviennent d'un fichier `.env.selfhost` ignoré par Git ou de secrets du runtime ; le Compose refuse les substitutions vides des variables obligatoires via syntaxe `:?`.
- **ET-6** — `tools/docker/check-selfhost.mjs` parse la configuration résolue, vérifie les services, utilisateurs, contrôles de santé et volumes, et peut lancer un essai réel via `docker compose up` dans un projet de test isolé.

## 7. Comportements attendus et cas limites

- **CL-1** — Secret obligatoire absent : `docker compose config` échoue avant tout conteneur.
- **CL-2** — Image web construite mais base indisponible : santé dégradée/échec, jamais `ok` fictif.
- **CL-3** — Arrêt/redémarrage : volumes Postgres et Storage préservés ; les migrations ne sont pas réexécutées de façon destructive.
- **CL-4** — Un Dockerfile tente de copier `.env.local` : test statique en échec.
- **CL-5** — Processus dans l'image exécuté en root : test de construction en échec.
- **CL-6** — Mailpit non activé : les services web/worker restent démarrables avec un autre transport e-mail configuré.
- **CL-7** — Docker absent : validation statique possible, test d'exécution en échec documenté sans preuve de démarrage.

## 8. Instructions d'implémentation

1. Activer la sortie standalone et écrire les deux Dockerfiles multi-étapes, `.dockerignore` et tests d'inspection. Commit `build(SPEC-012): construit les images web et worker`.
2. Écrire le Compose selfhost avec volumes, services tiers épinglés, santé et variables obligatoires ; vérifier `docker compose config`. Commit `build(SPEC-012): assemble la pile auto-hébergée`.
3. Rédiger `docs/operations/self-hosting.md` : prérequis, secrets, démarrage, migration, santé, sauvegarde, mise à jour et arrêt sans suppression. Commit `docs(SPEC-012): documente l'auto-hébergement`.
4. Ajouter le contrôle automatisé, la page SDD, les tests réels de construction/démarrage et e2e/visuels. Commit `test(SPEC-012): vérifie images et persistance`.
5. Exécuter la validation SDD et inscrire uniquement les résultats observés dans les preuves.

## 9. Fichiers et composants concernés

- **Créés** : `docker/web.Dockerfile`, `docker/worker.Dockerfile`, `docker/compose.selfhost.yml`, `.dockerignore`, `docs/operations/self-hosting.md`, `tools/docker/check-selfhost.mjs`, `tools/docker/test/integration/selfhost.test.ts`, `apps/web/components/sdd-demos/spec-012.tsx`, `apps/web/e2e/specs/p0/spec-012.spec.ts`.
- **Modifiés** : `apps/web/next.config.ts`, `package.json` (scripts de contrôle), `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `apps/worker` SPEC-007, configuration locale SPEC-008, `.env.example` et route santé SPEC-006.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-012` affiche `h1` « Auto-hébergement », le schéma des services « Web → Supabase / Inngest » et « Worker → Inngest », une table des images avec commit/version, la liste des sondes et une section « Commandes ». `data-testid` : `spec-012-services`, `spec-012-images`, `spec-012-health`, `spec-012-commands`. Les valeurs de secret n'apparaissent pas ; « Non vérifié » remplace tout état d'exécution manquant. Contrôles `expectTokens`, ordre, axe, capture desktop/mobile à `maxDiffPixelRatio: 0.01`.

## 11. Critères d'acceptation

- **CA-1** — Les deux images se construisent à partir du lockfile, démarrent sous utilisateur non root et répondent à leur santé.
- **CA-2** — Le Compose démarre les services déclarés, puis un redémarrage conserve les données d'un enregistrement de test.
- **CA-3** — Un secret absent empêche la configuration ; aucune image ni sortie ne contient de secret ou fichier `.env`.
- **CA-4** — Le document explique démarrage, migration, sauvegarde, mise à jour et arrêt sans effacer de volume.
- **CA-5** — La page de démonstration expose les composants et états réels, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `tools/docker/check-selfhost.test.ts`, `describe('[SPEC-012] selfhost config')` : services/volumes, secrets `:?`, Dockerfiles non root et sans `.env`, sections du guide (CA-3, CA-4).
- **Intégration** — `tools/docker/test/integration/selfhost.test.ts`, `describe('[SPEC-012] selfhost stack')` : construire les deux images, `docker compose config/up` en projet isolé, interroger santé, écrire/retrouver une donnée après redémarrage (CA-1, CA-2). Ce test ne peut être vert sans Docker réel.
- **End-to-end** — `apps/web/e2e/specs/p0/spec-012.spec.ts`, `test('inspecte la pile auto-hébergée @SPEC-012')` : ouvrir la démonstration, lire composants, sondes et version, garder la vidéo (CA-5).
- **Visuel** — `test('auto-hébergement conforme @SPEC-012 @visual')` : structure, jetons, axe et captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-007]`, `[SPEC-008]` et leurs scénarios e2e.

| Critère | Tests |
|---|---|
| CA-1 | intégration images |
| CA-2 | intégration Compose |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires guide |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-012/` contient les sorties de build et de `docker compose config` sans secret, le résultat des sondes, l'identifiant du volume de test, rapports, vidéo/captures et `acceptance.md`. Une validation statique seule ne satisfait pas CA-1/CA-2.

## 14. Définition de terminé

Toutes les conditions de `docs/engineering/testing.md` §7 passent, y compris construction et démarrage réels. Les images ne tournent pas en root, les volumes survivent au redémarrage et aucun secret n'est inclus dans les couches ou preuves.

## 15. Décisions et hypothèses

ADR-0053 fixe les deux usages de Docker et les composants auto-hébergés. La procédure reste une option de déploiement ; le lancement V1 sur services gérés relève de SPEC-013 et SPEC-808.
