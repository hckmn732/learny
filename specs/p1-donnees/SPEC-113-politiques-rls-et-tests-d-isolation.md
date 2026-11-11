---
id: SPEC-113
title: Politiques RLS et tests d'isolation
phase: P1
priority: V1
depends_on: [SPEC-102, SPEC-103, SPEC-104, SPEC-105, SPEC-106, SPEC-107, SPEC-108, SPEC-109, SPEC-110, SPEC-111, SPEC-112]
business_rules: [BR-APP-03, BR-GRP-03]
screens: []
adrs: [ADR-0022, ADR-0035]
visual: demo
---

# SPEC-113 — Politiques RLS et tests d'isolation

## 1. Objectif

Activer et vérifier Row Level Security sur toutes les tables applicatives du schéma `public`, avec politiques par propriétaire et partage limité du programme d'une formation à plusieurs. Un test d'isolation doit couvrir chaque table, chaque opération pertinente et au moins deux utilisateurs, afin qu'un bug de service ne puisse pas divulguer les données privées d'autrui.

## 2. Contexte

ADR-0022 impose RLS partout et des tests d'isolation par table. ADR-0035 distingue programme commun et données personnelles. `docs/architecture/data-model.md` §1–§12 définit toutes les tables et leurs colonnes propriétaire. Lire `docs/engineering/conventions.md` §7, `docs/product/business-rules.md` BR-APP-03 et BR-GRP-03, SPEC-101 (`userDb`/`serviceDb`) et les migrations SPEC-102 à 112. Les tests doivent utiliser des JWT utilisateur : `serviceDb()` contourne RLS et ne prouve donc rien.

## 3. Dépendances

- **SPEC-102 à SPEC-112** : toutes les tables sont migrées avant l'audit. Les nouvelles tables ultérieures devront adopter le même harnais RLS dans leur spécification.
- **SPEC-111** : `groups`, `group_members` et `group_member_progress` fournissent l'appartenance ; l'accès partagé ne porte que sur `formations`, `modules`, `chapters`, `notions` et les liens de programme.
- **SPEC-101** : clients user/service, transactions, migrations et Supabase local. Aucun compte de production n'est nécessaire.

## 4. Règles métier couvertes

- **BR-APP-03** : les apports `resources`/`resource_chunks` restent privés au propriétaire, même dans un groupe.
- **BR-GRP-03** : entre membres, seules prénom, module en cours, modules validés et série sont visibles via la vue prévue ; notes, lacunes, apports, cours et discussions ne deviennent pas lisibles par appartenance.

## 5. Exigences fonctionnelles

- **EF-1** — Chaque table applicative du schéma `public` a `relrowsecurity=true` ; aucune table nouvellement créée par SPEC-102–112 n'est exemptée. Les tables personnelles autorisent lecture/écriture seulement si `user_id` ou `owner_id` correspond à `auth.uid()`, avec `WITH CHECK` sur insertion et mise à jour.
- **EF-2** — Les membres d'un groupe actif peuvent lire le programme commun (`formations`, `modules`, `chapters`, `notions`, `notion_links` dont `owner_id` est nul) ; seul le propriétaire du groupe peut le modifier. Un membre sortant perd cet accès dès la transaction de sortie.
- **EF-3** — Toutes les données d'étude personnelles (`module_progress`, `chapter_progress`, `resources`, `resource_chunks`, `courses`, `course_sections`, `citations`, `bricks` et versions/rapports, `activities`, `attempts`, `answers`, `notion_states`, `review_logs`, `gap_events`, `schedule_slots`, conversations/messages et réglages) restent invisibles aux autres membres.
- **EF-4** — `group_member_progress` expose exactement les champs admis de BR-GRP-03. `profiles.email`, notes, lacunes, apports et contenu de cours sont absents du résultat et inaccessibles par jointure sous le rôle utilisateur.
- **EF-5** — Les tables d'administration/service (`rate_limits`, livraisons, appels IA, abonnements, clés idempotentes selon accès) ont des politiques restrictives ; le rôle service ne sert qu'aux jobs et mutations système listés dans leurs spécifications, avec lecture utilisateur projetée si nécessaire.
- **EF-6** — Un harnais teste automatiquement toutes les tables `public` : lecture d'une ligne de A par B → aucune ligne, tentative d'insertion avec `user_id=A` sous B → rejet, modification/suppression par B → zéro ligne ou rejet. Les tables de programme partagé ont en plus les cas membre/propriétaire/non-membre.
- **EF-7** — La CI échoue si une table `public` n'a pas RLS activée, si une politique utilise `USING(true)`/`WITH CHECK(true)` sans justification de rôle, ou si une table n'a pas de cas de test déclaré.

## 6. Exigences techniques

- **ET-1** — Migration `NNNN_rls_policies.sql` versionnée sous Drizzle et copiée dans Supabase ; activer `FORCE ROW LEVEL SECURITY` là où le propriétaire de table pourrait autrement contourner des tests, sans casser les migrations du rôle service.
- **ET-2** — Les politiques vérifient `auth.uid()` et une fonction d'appartenance sécurisée qui ne permet pas de lire la table des membres d'un autre groupe ; éviter la récursion RLS et rendre explicite la recherche du rôle propriétaire.
- **ET-3** — Les FK et fonctions SQL `security definer` qui créent une projection limitée ont `search_path` fixé, droits `EXECUTE` limités et contrôles d'appartenance internes. Ne pas laisser un `security definer` général qui renvoie `SELECT *`.
- **ET-4** — `packages/db/test/integration/rls-matrix.test.ts` construit son inventaire via `pg_catalog` ; une table apparue après la matrice sans scénario provoque échec. Les fixtures créent A, B et un membre C, avec ressources et résultats distincts.
- **ET-5** — Le test de RLS n'utilise jamais `serviceDb` pour l'opération à vérifier ; il utilise des clients Supabase signés avec les JWT et examine SQLSTATE/absence de lignes. Le service peut créer les fixtures avant le test, puis les clients utilisateur sont utilisés.
- **ET-6** — Les politiques de groupe ne s'appliquent qu'aux lignes du programme liées à la formation ; les liens personnels `notion_links.owner_id` restent privés.

## 7. Comportements attendus et cas limites

- **CL-1** — UUID connu d'un apport de A demandé par B membre du même groupe : aucune donnée.
- **CL-2** — B essaie `INSERT ... owner_id=A` : rejet `WITH CHECK` ; changer le propriétaire d'une ligne existante : rejet.
- **CL-3** — B lit le programme commun : succès ; B tente de modifier un chapitre : refus ; propriétaire A modifie : succès.
- **CL-4** — B quitte le groupe : accès au programme commun révoqué immédiatement après commit, sauf sa copie personnelle créée par SPEC-724.
- **CL-5** — Vue de progression : seule la projection BR-GRP-03, aucun e-mail ou note même via filtre/ordre.
- **CL-6** — Table sans politique ou RLS inactive ajoutée plus tard : test de catalogue échoue.
- **CL-7** — Appel à fonction `security definer` par non-membre : zéro ligne/refus, même avec identifiant de groupe valide.
- **CL-8** — Rôle service utilisé par un job : fonctionnalité autorisée, mais le test d'isolation utilisateur reste indépendant de ce rôle.

## 8. Instructions d'implémentation

1. Inventorier toutes les tables via `pg_catalog` et classer programme partagé, personnel, service ; produire une matrice table × rôle × opération dans le test, sans omission. Commit `test(SPEC-113): inventorie les tables et accès attendus`.
2. Écrire la migration RLS et les fonctions d'appartenance/projection, fixer droits et `search_path` ; copier vers Supabase. Commit `feat(SPEC-113): impose les politiques RLS`.
3. Exécuter les scénarios A/B/C pour chaque table et corriger toute fuite ou permission excessive ; rejouer les tests des SPEC-102–112. Commit `test(SPEC-113): prouve l'isolation de chaque table`.
4. Ajouter page SDD et e2e/visuel, puis validation complète et `acceptance.md`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/migrations/NNNN_rls_policies.sql` et copie Supabase, `packages/db/src/rls/matrix.ts`, `packages/db/src/rls/matrix.test.ts`, `packages/db/test/integration/rls-matrix.test.ts`, `apps/web/components/sdd-demos/spec-113.tsx`, `apps/web/e2e/specs/p1/spec-113.spec.ts`.
- **Modifiés** : politiques de migrations P1 si une correction additive est nécessaire (nouvelle migration uniquement), `packages/db/src/index.ts`, registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : toutes les tables P1, `userDb`/`serviceDb`, `group_member_progress`.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-113` affiche « Isolation des données », total réel des tables `public`, nombre avec RLS, table de catégories « Programme partagé / Personnel / Service » et une matrice de trois utilisateurs A/propriétaire, B/membre et C/non-membre. `data-testid` : `spec-113-count`, `spec-113-categories`, `spec-113-matrix`. Chaque cellule montre « autorisé » ou « refusé » en texte. Aucune donnée privée réelle n'est affichée. Contrôles jetons, structure, axe, captures desktop/mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Toutes les tables applicatives `public` ont RLS activée et un scénario d'accès déclaré.
- **CA-2** — A/B/C respectent partage du programme, écriture propriétaire et confidentialité de toutes les tables personnelles.
- **CA-3** — Les fonctions/vue à droits élevés refusent un non-membre et ne retournent que les colonnes autorisées.
- **CA-4** — Le harnais échoue si RLS est retirée d'une table de copie ou qu'une politique permissive est introduite.
- **CA-5** — La démonstration affiche les nombres mesurés, catégories et matrice, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/rls/matrix.test.ts`, `describe('[SPEC-113] RLS inventory')` : matrice exhaustive, classifications, rejet de politique `true` sans justification (CA-1, CA-4).
- **Intégration** — `packages/db/test/integration/rls-matrix.test.ts`, `describe('[SPEC-113] RLS isolation')` : introspection `pg_catalog` et A/B/C pour chaque table, projection de groupe, sortie et fonction `security definer` ; test de mutation temporaire d'une politique dans une transaction annulée pour prouver l'échec du harnais (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-113.spec.ts`, `test('inspecte la matrice RLS @SPEC-113')` : ouvrir la démonstration, vérifier comptes et catégories, vidéo (CA-5).
- **Visuel** — `test('matrice RLS conforme @SPEC-113 @visual')` : jetons, structure, axe, captures ≤ 1 % (CA-5).
- **Non-régression** — tous les tests d'intégration `[SPEC-102]` à `[SPEC-112]`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration introspection |
| CA-2 | intégration A/B/C |
| CA-3 | intégration vue/fonctions |
| CA-4 | intégration mutation temporaire |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-113/` contient la liste mesurée des tables et politiques, résultat par table/opération/rôle, rapports, vidéo/captures, `checks.json` et `acceptance.md`. Une ligne échouée reste visible ; aucun total n'est inventé.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent ; aucune table `public` sans RLS, aucune fuite entre A/B/C et tout ajout de table future est détecté par le harnais. La matrice de tests ne s'appuie pas sur le rôle service pour prouver l'isolation.

## 15. Décisions et hypothèses

ADR-0022 fixe RLS partout ; ADR-0035 fixe la frontière programme partagé/données privées. Les politiques des migrations antérieures sont renforcées par une nouvelle migration, jamais réécrites après fusion.
