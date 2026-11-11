---
id: SPEC-106
title: Schéma briques, activités et tentatives
phase: P1
priority: V1
depends_on: [SPEC-103]
business_rules: [BR-BRI-06]
screens: []
adrs: [ADR-0021]
visual: demo
---

# SPEC-106 — Schéma briques, activités et tentatives

## 1. Objectif

Créer les tables qui conservent les briques versionnées, les activités ordonnées, les tentatives et réponses d'un apprenant. Le schéma doit enregistrer la version exacte utilisée pour chaque réponse et empêcher qu'une brique signalée ou appartenant à autrui soit injectée dans une activité.

## 2. Contexte

`docs/architecture/data-model.md` §5 définit les six tables, énumérations et champs. `docs/product/business-rules.md` BR-BRI-06 impose la validité des briques dans une activité ; ADR-0021 exige une validation de schéma et un garde-fou avant toute écriture du tuteur. Lire SPEC-101 (migrations et client), SPEC-103 (formation, modules, notions), `docs/engineering/conventions.md` §7 et `docs/engineering/testing.md` §1–§3. SPEC-501 apportera les schémas par type de brique ; cette spécification stocke le payload JSON et son statut sans prétendre le valider par les schémas futurs.

## 3. Dépendances

- **SPEC-103** : `formations`, `modules`, `notions` et ownership ; les clés étrangères de `bricks` et `activities` s'y rattachent.
- **SPEC-101** : Drizzle, migration générée/copieuse Supabase, `withRollback` et types de base.
- **SPEC-102** : `profiles` référencé par `owner_id` et `user_id` ; les politiques RLS s'appuient sur l'identité.
- Aucune dépendance IA ou service externe ; les payloads de test sont des objets JSON déterministes.

## 4. Règles métier couvertes

- **BR-BRI-06** : une activité n'utilise que des briques valides et appartenant au même apprenant. Le schéma stocke les identifiants de version ; le service de SPEC-501 vérifie le payload selon le type avant assemblage, et un garde SQL empêche une référence à un autre propriétaire ou à une version inexistante.

## 5. Exigences fonctionnelles

- **EF-1** — `bricks` stocke `owner_id`, `formation_id`, `type` parmi les 13 types `text`, `resource_excerpt`, `choice_question`, `open_question`, `cloze`, `matching`, `ordering`, `categorization`, `recall_card`, `instruction`, `scripted_dialogue`, `timer`, `scoring`, `notion_ids`, `purpose`, `status` et `current_version`. Une brique signalée ne peut plus être sélectionnée pour une nouvelle activité.
- **EF-2** — `brick_versions` conserve chaque `payload` JSON, son numéro, son origine, son auteur et son empreinte SHA-256 pour les questions ; une version existante n'est pas réécrite. `brick_reports` conserve raison ≤ 500 caractères, statut ouvert/corrigé/rejeté et résolution.
- **EF-3** — `activities` stocke le type d'activité, sa configuration, le tableau ordonné `items` de références `brickId`/`brickVersionId`/points, statut brouillon/prête/archivée et `for_date` pour une session quotidienne. La transition vers `ready` vérifie l'existence et l'appartenance de chaque version.
- **EF-4** — `attempts` numérote les essais par activité et apprenant, suit `in_progress`/`submitted`/`graded`/`timed_out`/`abandoned`, instant de départ et limite, durée, score sur 100, réussite, détail par notion et nombre d'indices. Deux tentatives ne partagent pas le même numéro pour un même couple activité/utilisateur.
- **EF-5** — `answers` lie une position unique de tentative à une `brick_version_id`, réponse JSON, justesse, score/max, durée, correcteur code/tuteur, retour, notion de distracteur choisi et marqueur de revue. La version reste celle présentée pendant l'essai même si une version plus récente est publiée.
- **EF-6** — Les types Drizzle des six tables et les énumérations sont exportés depuis `@learny/db` ; un service peut créer une activité et une tentative dans une transaction, puis relire exactement les versions et réponses enregistrées.

## 6. Exigences techniques

- **ET-1** — Implémenter les colonnes et valeurs de `data-model.md` §5 sans changer les noms. UUID `gen_random_uuid()`, clés étrangères `on delete cascade` vers propriétaires, timestamps UTC, index sur `owner_id` et les clés de lecture.
- **ET-2** — Énumérations `brick_type`, `brick_purpose`, `brick_status`, `activity_kind`, `activity_status`, `attempt_status` et `grader` avec valeurs de `data-model.md`. `score` et `max_score` sont `numeric(5,2)` et les durées non négatives.
- **ET-3** — `brick_versions` a `unique(brick_id, version)` et index `fingerprint`. `attempts` a `unique(activity_id, user_id, attempt_no)` ; `answers` a `unique(attempt_id, position)`. `current_version >= 1` et `attempt_no >= 1` sont vérifiés par contraintes SQL.
- **ET-4** — Les colonnes `items`, `config`, `response`, `per_notion` et `feedback` sont des objets/tableaux JSON de forme minimale vérifiée par Zod à l'entrée des repositories ; `items` est un tableau ordonné non vide pour une activité `ready`.
- **ET-5** — Une fonction transactionnelle `assertActivityItemsOwned` vérifie pour chaque `brickVersionId` la brique, son propriétaire, son statut et la formation. La vérification ne se limite pas au client ; l'écriture doit échouer si le propriétaire diffère.
- **ET-6** — Générer une migration Drizzle et la copier dans `supabase/migrations` avec le même contenu ; activer RLS sur chaque table dès sa création. SPEC-113 ajoutera et vérifiera la matrice complète des politiques, sans fenêtre de lecture publique entre-temps.
- **ET-7** — Les tests d'intégration utilisent `userDb(ctx)` pour les lectures/écritures utilisateur et `serviceDb()` seulement pour la seed autorisée. Ne pas utiliser le rôle service pour démontrer l'isolation.

## 7. Comportements attendus et cas limites

- **CL-1** — Version 0 ou doublon de version : contrainte SQL, aucune modification de la version existante.
- **CL-2** — Empreinte de question répétée : index permet de détecter le doublon ; la politique de réutilisation appartient à SPEC-513.
- **CL-3** — Activité `ready` avec une brique signalée, retirée ou d'autrui : refus avant commit.
- **CL-4** — Deux créations concurrentes de tentative numéro N : une seule réussit ; l'autre relit le prochain numéro dans une transaction.
- **CL-5** — Nouvelle version d'une brique après le début d'un essai : les réponses restent liées à l'ancienne `brick_version_id`.
- **CL-6** — Score hors 0..100, durée négative ou `max_score < score` : refus par contraintes et validation.
- **CL-7** — Suppression d'une activité : ses tentatives/réponses suivent la politique de suppression du propriétaire ; aucune réponse orpheline.
- **CL-8** — Accès par un autre utilisateur : RLS refuse lecture et écriture sur les six tables.

## 8. Instructions d'implémentation

1. Écrire les énumérations et les six tables dans `packages/db/src/schema/bricks-activities.ts` avec contraintes et index ; exporter les types depuis l'index. Commit `feat(SPEC-106): crée les tables de briques et tentatives`.
2. Générer la migration via SPEC-101, la copier vers Supabase et activer RLS avec politiques propriétaire minimales compatibles avec SPEC-113. Commit `feat(SPEC-106): migre et protège les activités`.
3. Ajouter les schémas Zod des JSON et le garde transactionnel d'assemblage ; tester version et appartenance. Commit `feat(SPEC-106): valide les références de briques`.
4. Écrire les tests, la page SDD et le scénario e2e/visuel ; exécuter `validate.mjs` et renseigner les preuves réelles.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/bricks-activities.ts`, `packages/db/src/schema/bricks-activities.test.ts`, `packages/db/src/schema/bricks-json.ts`, `packages/db/src/repositories/activities.ts`, `packages/db/migrations/NNNN_bricks_activities.sql` et sa copie Supabase, `packages/db/test/integration/bricks-activities.test.ts`, `apps/web/components/sdd-demos/spec-106.tsx`, `apps/web/e2e/specs/p1/spec-106.spec.ts`.
- **Modifiés** : `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`, registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `profiles`, `formations`, `modules`, `notions`, harnais transactionnel de SPEC-101.

## 10. Interface et conformité visuelle

Mode `demo`, `/_dev/sdd/SPEC-106` : tableau « Types de briques » (13 lignes), carte « Activité » avec trois versions ordonnées, carte « Tentative » avec numéro et statut, puis « Réponses » montrant la version figée. La page lit une fixture de test isolée, pas la base d'un apprenant. `data-testid` : `spec-106-types`, `spec-106-activity`, `spec-106-attempt`, `spec-106-answers`. À 390 px, les tableaux défilent dans une région nommée. Vérifier jetons, structure, axe et capture `toHaveScreenshot('spec-106-schema.png', { maxDiffPixelRatio: 0.01 })`.

## 11. Critères d'acceptation

- **CA-1** — Les six tables et leurs énumérations correspondent à `data-model.md` §5 ; les versions et positions en double sont refusées.
- **CA-2** — Une activité `ready` contenant une brique signalée ou appartenant à un autre utilisateur est refusée sans écriture partielle.
- **CA-3** — Une tentative garde ses `brick_version_id` après publication d'une nouvelle version ; scores/durées hors bornes échouent.
- **CA-4** — Deux utilisateurs ne peuvent ni lire ni écrire les lignes l'un de l'autre avec `userDb`.
- **CA-5** — La page SDD montre types, activité, tentative et réponses, passe axe, vidéo et capture desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/bricks-activities.test.ts`, `describe('[SPEC-106] brick schema')` : valeurs d'enum, JSON `items`, scores, versions, empreinte et garde d'assemblage (CA-1 à CA-3).
- **Intégration** — `packages/db/test/integration/bricks-activities.test.ts`, `describe('[SPEC-106] brick persistence')` : migration, contraintes SQL, transaction, concurrence des tentatives et deux JWT distincts pour RLS (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-106.spec.ts`, `test('inspecte les briques et tentatives @SPEC-106')` : ouvrir la démonstration, comparer activité et réponses, conserver la vidéo (CA-5).
- **Visuel** — `test('schéma des briques conforme @SPEC-106 @visual')` : structure, jetons, axe et captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-103]` et tests de migration/isolement P1 existants.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration migration |
| CA-2 | unitaires garde ; intégration transaction |
| CA-3 | intégration versions |
| CA-4 | intégration RLS |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-106/` contient rapports, résultat SQL des contraintes et RLS, vidéo/captures de la démonstration, `checks.json` et `acceptance.md` lié aux tests. Les fixtures ne contiennent aucune donnée personnelle réelle.

## 14. Définition de terminé

Les exigences de `docs/engineering/testing.md` §7 passent. La migration est identique dans Drizzle et Supabase, RLS est active sur les six tables, les versions utilisées par les réponses sont immuables et une activité invalide ne peut être publiée.

## 15. Décisions et hypothèses

ADR-0021 impose la validation des actions du tuteur avant toute écriture. La validation détaillée du payload de chaque type sera livrée par SPEC-501 ; cette spécification garantit d'abord intégrité, appartenance et version. SPEC-113 renforcera l'audit RLS transversal.
