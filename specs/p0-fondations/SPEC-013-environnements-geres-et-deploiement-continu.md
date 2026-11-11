---
id: SPEC-013
title: Environnements gérés et déploiement continu
phase: P0
priority: V1
depends_on: [SPEC-009, SPEC-011]
business_rules: [BR-PLA-04]
screens: []
adrs: [ADR-0006, ADR-0017]
visual: demo
---

# SPEC-013 — Environnements gérés et déploiement continu

## 1. Objectif

Définir les environnements preview et production gérés (Vercel, Supabase Cloud et Inngest Cloud), leurs régions européennes et le pipeline de déploiement. Fournir des commandes de vérification et de migration sûres ; si les accès externes manquent, conserver une configuration contrôlée sans annoncer un déploiement réalisé.

## 2. Contexte

`docs/architecture/overview.md` §2 et §6 décrit les hôtes, les régions et les modes local/test/preview/production. ADR-0006 impose Supabase à Francfort ; ADR-0017 impose Inngest et ses deux points d'entrée ; ADR-0052 place la CI sur GitHub Actions. Lire `docs/engineering/git.md` §1–§5, `docs/engineering/testing.md` §7, `docs/engineering/conventions.md` §7–§9, `.env.example` et `specs/checkpoints.md`. SPEC-009 valide les secrets et SPEC-011 valide le code avant le déploiement. La publication de la V1 et le tag `v1.0.0` relèvent de SPEC-808.

## 3. Dépendances

- **SPEC-009** : schéma des variables, refus d'un environnement de production incomplet et constantes `HOSTING_REGIONS`.
- **SPEC-011** : workflow de qualité préalable, artefacts et contrôle des secrets.
- **Externes** : projets Vercel et Supabase en UE, environnement Inngest Cloud, identifiants de déploiement et droits de migration. Leur absence est un blocage externe documenté via le processus SDD, jamais contourné par des valeurs fictives.
- **Outils** : CLI Vercel et Supabase versions verrouillées, GitHub Actions. Les scripts offrent un `--dry-run` sans accès de production pour valider la configuration.

## 4. Règles métier couvertes

- **BR-PLA-04** : base, fichiers et fonctions doivent être hébergés dans l'Union européenne. Le web est ciblé sur `fra1`, Supabase sur `eu-central-1` et Inngest sur la région européenne déclarée ; le pipeline refuse une région hors de `HOSTING_REGIONS` ou une valeur inattendue.

## 5. Exigences fonctionnelles

- **EF-1** — `vercel.json` cible la région `fra1`, ajoute les en-têtes de sécurité de base et interdit l'indexation des pages SDD. Les fonctions serveur utilisent la même région européenne ; les routes ne changent pas entre preview et production.
- **EF-2** — Une PR avec CI verte produit une preview à partir d'un projet Supabase preview UE et d'une branche Inngest dédiée ; les données et clés de production ne sont jamais utilisées dans une preview. La preview est étiquetée et son URL est fournie par le fournisseur réel, non construite dans le dépôt.
- **EF-3** — Un tag `v*` créé sur `main` et une CI verte déclenchent le pipeline de production : vérification des variables/régions, migrations Supabase distantes avec liste de migrations en attente, synchronisation Inngest, déploiement Vercel puis contrôles de fumée. Une étape en erreur arrête la suite et conserve les logs expurgés.
- **EF-4** — `tools/deploy/check.mjs` valide les régions, le mode de service, les variables obligatoires, la branche/ref et l'absence de pages SDD en production. `--dry-run` affiche les actions à exécuter et les destinations masquées, sans mutation distante.
- **EF-5** — Les migrations distantes sont appliquées une seule fois, dans l'ordre, sans modifier une migration déjà publiée. Le script donne une sauvegarde ou un point de restauration documenté avant production ; il ne lance jamais `db:reset` sur une base distante.
- **EF-6** — `docs/operations/deployment.md` fournit la matrice des environnements, la liste des secrets à créer dans GitHub/Vercel/Supabase/Inngest, les régions, l'ordre de déploiement, la procédure de retour arrière et les vérifications post-déploiement.
- **EF-7** — La page `/_dev/sdd/SPEC-013` montre la matrice local/test/preview/production, les régions attendues et le résultat du dernier contrôle `--dry-run`, sans afficher de token ni prétendre qu'un environnement externe existe.
- **EF-8** — En absence des secrets/services gérés, les contrôles statiques et `--dry-run` restent exécutables ; l'essai réel échoue avec une liste des dépendances manquantes. Le blocage est consigné selon `sdd-process.md` §3, et les tâches indépendantes continuent.

## 6. Exigences techniques

- **ET-1** — `.github/workflows/deploy.yml` a des permissions minimales, attend la réussite de la CI pour la ref exacte, sépare `preview` et `production`, utilise des environnements GitHub distincts et ne publie aucun secret en sortie.
- **ET-2** — `tools/deploy/check.mjs` lit `HOSTING_REGIONS` et la configuration réelle ; il n'accepte pas une région saisie librement qui n'est pas sur la liste UE. Les tests injectent les variables, sans charger celles du poste.
- **ET-3** — `tools/deploy/migrate.mjs` appelle la CLI Supabase avec arguments séparés, liste les migrations avant application, exige `APP_ENV=preview|production` explicite et refuse les URL locales pour une migration distante. Le mode `--dry-run` ne fait aucun appel de mutation.
- **ET-4** — `tools/deploy/sync-inngest.mjs` pointe vers les fonctions du build de la ref déployée et vérifie le résultat de synchronisation ; une fonction absente ou une région hors UE provoque un échec.
- **ET-5** — Les en-têtes de sécurité initiaux dans `vercel.json` ne contredisent pas la CSP à nonce future de SPEC-805. Aucun secret n'est écrit dans le fichier JSON, le code source ou les artefacts CI.
- **ET-6** — Les scripts ont des codes de sortie distincts pour configuration invalide et service externe indisponible ; le rapport de déploiement associe commit, environnement, migration et résultat de fumée réellement obtenus.

## 7. Comportements attendus et cas limites

- **CL-1** — Région Vercel/Supabase/Inngest hors UE : contrôle en échec avant déploiement.
- **CL-2** — Secrets preview absents : preview non lancée ; production inchangée et blocage explicite.
- **CL-3** — Tag `v*` sur une autre branche ou CI rouge : production non déclenchée.
- **CL-4** — Migration en erreur : arrêt avant synchronisation et web ; le rapport conserve la migration fautive, sans marquer la livraison réussie.
- **CL-5** — `--dry-run` avec accès réseau absent : configuration vérifiée localement, aucune migration ou publication.
- **CL-6** — URL de production passée à `db:reset` : refus par le garde SPEC-008 ; le workflow ne l'appelle jamais.
- **CL-7** — Fonction Inngest non synchronisée : pipeline en échec et fumée non prétendue verte.
- **CL-8** — Pages SDD activées en production : validation de configuration en échec même si le build réussit.

## 8. Instructions d'implémentation

1. Écrire `vercel.json` et le contrôle des régions à partir de `HOSTING_REGIONS` ; tester les trois régions et le refus hors UE. Commit `build(SPEC-013): fixe les régions gérées`.
2. Écrire `tools/deploy/check.mjs`, `migrate.mjs` et `sync-inngest.mjs` avec `--dry-run` et erreurs sûres. Commit `feat(SPEC-013): prépare les déploiements contrôlés`.
3. Créer le workflow `deploy.yml` séparant preview/production, avec dépendance à la CI et secrets d'environnement distincts. Commit `ci(SPEC-013): déploie les environnements gérés`.
4. Rédiger `deployment.md`, puis la page SDD et les tests unitaires, intégration, navigateur et visuels. Commit `test(SPEC-013): vérifie régions et pipeline`.
5. Exécuter les validations disponibles ; si les accès externes manquent, consigner le blocage externe plutôt que simuler la validation distante.

## 9. Fichiers et composants concernés

- **Créés** : `vercel.json`, `.github/workflows/deploy.yml`, `tools/deploy/check.mjs`, `tools/deploy/migrate.mjs`, `tools/deploy/sync-inngest.mjs`, `tools/deploy/check.test.ts`, `tools/deploy/test/integration/dry-run.test.ts`, `docs/operations/deployment.md`, `apps/web/components/sdd-demos/spec-013.tsx`, `apps/web/e2e/specs/p0/spec-013.spec.ts`.
- **Modifiés** : `package.json` (scripts), `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`, éventuellement `.github/workflows/ci.yml` pour exposer la ref validée.
- **Lus / réutilisés** : `@learny/config/HOSTING_REGIONS`, schéma de SPEC-009, migrations de SPEC-101 quand elles existent, workflow SPEC-011.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-013` affiche `h1` « Déploiement géré », une table des quatre environnements (Web, Base, Jobs, IA), une carte « Régions UE » et un rapport `--dry-run` avec actions prévues et avertissements. `data-testid` : `spec-013-environments`, `spec-013-regions`, `spec-013-dry-run`. Les destinations réelles ne sont indiquées que si elles ont été vérifiées ; « Non configuré » est le libellé par défaut. La page ne contient ni bouton de déploiement ni token. Tester `expectTokens`, ordre des régions, axe et captures desktop/mobile à 1 %.

## 11. Critères d'acceptation

- **CA-1** — La configuration fixe web/base/jobs en UE et refuse une région non autorisée.
- **CA-2** — `--dry-run` vérifie les variables, liste les actions et n'effectue aucune mutation distante.
- **CA-3** — Le workflow preview utilise seulement ses secrets et une CI verte ; le workflow production exige un tag `v*` de `main` et s'arrête sur migration/synchronisation échouée.
- **CA-4** — Le guide donne les variables, l'ordre des migrations, fumées et retour arrière, sans secret fictif.
- **CA-5** — La page SDD montre les configurations vérifiées, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `tools/deploy/check.test.ts`, `describe('[SPEC-013] managed regions')` : régions correctes, hors UE, SDD actif en production, variables absentes et ref invalide (CA-1, CA-2).
- **Intégration** — `tools/deploy/test/integration/dry-run.test.ts`, `describe('[SPEC-013] deployment dry-run')` : exécuter les scripts contre adaptateurs factices comptant les appels, vérifier zéro mutation en `--dry-run`, arrêt sur échec et règles du YAML ; contrôler la présence des étapes du guide (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-013.spec.ts`, `test('inspecte les régions de déploiement @SPEC-013')` : ouvrir la démonstration, vérifier matrice, régions et « Non configuré » sans accès externe ; conserver la vidéo (CA-5).
- **Visuel** — `test('déploiement conforme @SPEC-013 @visual')` : jetons, structure, axe, captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-009]`, `[SPEC-011]` et leurs e2e.

| Critère | Tests |
|---|---|
| CA-1 | unitaires régions |
| CA-2 | unitaires ; intégration dry-run |
| CA-3 | intégration workflow |
| CA-4 | intégration guide |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-013/` contient rapports, sortie de `--dry-run` expurgée, validation du workflow et des régions, vidéo/captures, `checks.json` et `acceptance.md`. Une URL de preview ou un succès de production n'est mentionné que s'il provient d'un déploiement réel vérifié.

## 14. Définition de terminé

Les conditions de `docs/engineering/testing.md` §7 passent pour le code et la configuration. Si des identifiants externes empêchent l'essai réel, la spécification est déclarée bloquée selon `sdd-process.md`, jamais terminée sur un simple `--dry-run`. Aucune région hors UE n'est acceptée.

## 15. Décisions et hypothèses

ADR-0006 fixe Supabase en `eu-central-1`, ADR-0017 Inngest, ADR-0052 la CI. Le montant d'abonnement, l'identité légale et les secrets sont fournis hors dépôt ; cette spécification ne les invente pas. SPEC-808 prendra la décision de mise en production après les contrôles réels.
