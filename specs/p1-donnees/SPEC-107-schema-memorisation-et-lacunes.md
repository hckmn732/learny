---
id: SPEC-107
title: Schéma mémorisation et lacunes
phase: P1
priority: V1
depends_on: [SPEC-106]
business_rules: []
screens: []
adrs: [ADR-0024, ADR-0025]
visual: demo
---

# SPEC-107 — Schéma mémorisation et lacunes

## 1. Objectif

Persister pour chaque apprenant et notion une carte FSRS, son échéance, sa maîtrise et l'état éventuel d'une lacune ; conserver l'historique des révisions et des changements de lacune. Le schéma doit permettre une lecture rapide des notions dues sans perdre la trace des versions avant/après chaque réponse.

## 2. Contexte

`docs/architecture/data-model.md` §6 fixe `notion_states`, `review_logs` et `gap_events`. ADR-0025 prescrit FSRS par notion ; ADR-0024 fixe la maîtrise et la qualification des lacunes. Lire `docs/product/business-rules.md` BR-MEM-01 à BR-MEM-09 et BR-LAC-01 à BR-LAC-06, SPEC-103 pour `notions`, SPEC-106 pour `answers`, SPEC-101 pour migrations et RLS initiale. Le calcul FSRS et la détection appartiennent aux SPEC-402 à 404 ; cette spécification ne les reprogramme pas en SQL.

## 3. Dépendances

- **SPEC-106** : `answers.id` pour rattacher un résultat à une révision ; l'absence d'une réponse est admise pour échauffement, autoévaluation et import hors ligne.
- **SPEC-103** : `notions.id` et `profiles.id`, propriétaire des lignes.
- **SPEC-101** : schéma Drizzle, migrations, `userDb` et harnais `withRollback`. Aucun fournisseur IA ni service réseau n'est requis.

## 4. Règles métier couvertes

Aucune règle `BR-*` n'est attribuée directement ; les tables soutiennent BR-MEM et BR-LAC qui seront réalisées par les services SPEC-402–411. Une valeur de maîtrise ou une nature de lacune stockée doit rester dans les domaines définis par ADR-0024.

## 5. Exigences fonctionnelles

- **EF-1** — `notion_states` a une ligne unique par `(user_id, notion_id)` ; elle conserve `fsrs` JSON non nul, `due_at` indexé, `mastery` de 0 à 100, dates de première/dernière vue, `success_count`, `suspended` et `in_review`. Une notion nouvellement créée peut avoir une échéance nulle avant la première réponse.
- **EF-2** — Une lacune porte `gap_nature` parmi `forgetting`, `confusion`, `misunderstanding`, `application`, `gap_confused_with` le cas échéant, preuve, instant de détection et de levée. `gap_confused_with` référence une autre notion de la même formation ; une notion ne se confond pas avec elle-même.
- **EF-3** — `review_logs` enregistre une ligne par révision appliquée : source, note FSRS `again|hard|good|easy`, justesse, durée, horodatage UTC, état FSRS avant et après, `answer_id` facultatif. Le journal est append-only pour conserver l'historique pédagogique.
- **EF-4** — `gap_events` enregistre `detected`, `nature_changed` et `cleared`, nature, preuve JSON et date UTC. Une lacune peut avoir plusieurs événements mais son état courant reste dans `notion_states` ; service et événement sont écrits dans la même transaction.
- **EF-5** — Une requête `getDueNotionStates(userId, now)` renvoie uniquement les notions `in_review=true`, non suspendues, dont `due_at <= now`, triées par échéance et identifiant pour un résultat stable. L'index partiel rend la requête utilisable sans parcourir tous les apprenants.
- **EF-6** — Les DTO de test affichent le nombre de notions dues, les quatre natures possibles et un historique avant/après sans exposer le contenu d'un autre utilisateur.

## 6. Exigences techniques

- **ET-1** — Drizzle et SQL portent les colonnes de `data-model.md` §6, clés étrangères vers `profiles`/`notions`/`answers`, `pk(user_id, notion_id)`, index partiel `(user_id, due_at) WHERE in_review` et index chronologique `review_logs(user_id, notion_id, reviewed_at)`.
- **ET-2** — Valider `fsrs` avec le schéma sérialisé de `ts-fsrs` : `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`. L'adaptateur de persistance convertit les dates en ISO UTC ; une valeur non finie est refusée.
- **ET-3** — Contraintes SQL : `mastery BETWEEN 0 AND 100`, `success_count >= 0`, `time_ms >= 0`, `gap_confused_with <> notion_id`, `gap_cleared_at >= gap_detected_at` quand les deux existent. La nature `confusion` peut conserver la notion confondue ; les autres natures la vident.
- **ET-4** — RLS activée dès la migration, politique initiale `user_id = auth.uid()` sur les trois tables. SPEC-113 audite et complète la matrice ; le rôle service est réservé aux jobs explicitement autorisés.
- **ET-5** — Les services peuvent faire un `upsert` de `notion_states` avec condition de version ou verrou de ligne, puis insérer `review_logs` et `gap_events` dans la même transaction ; deux réponses concurrentes ne doivent pas écraser une révision déjà appliquée.
- **ET-6** — Générer la migration Drizzle et sa copie identique dans `supabase/migrations`. Exporter types et schémas Zod depuis `@learny/db` sans calcul métier dans le paquet DB.

## 7. Comportements attendus et cas limites

- **CL-1** — État FSRS mal formé ou date invalide : rejet avant écriture, sans `review_log` orphelin.
- **CL-2** — Maîtrise négative ou supérieure à 100 : contrainte SQL en échec.
- **CL-3** — Deux réponses à la même notion simultanées : sérialisation/verrouillage, une applique son état à la suite de l'autre ; aucun retour en arrière de `due_at` par écrasement.
- **CL-4** — Lacune `cleared` sans lacune active : service idempotent, pas de deuxième événement identique.
- **CL-5** — `answer_id` supprimé avec une tentative : le journal de révision garde les mesures, avec FK mise à null si la politique de rétention l'autorise.
- **CL-6** — Autre utilisateur interroge une notion connue par UUID : aucune ligne lue ni modifiée via `userDb`.
- **CL-7** — Notion suspendue et due : exclue de `getDueNotionStates`.
- **CL-8** — Changement d'heure locale : `due_at` reste un instant UTC ; le calcul de jour local appartient à SPEC-207.

## 8. Instructions d'implémentation

1. Créer les énumérations et trois tables Drizzle, les contraintes et index ; exporter les types. Commit `feat(SPEC-107): crée les états de mémorisation et lacunes`.
2. Générer la migration et sa copie Supabase, activer RLS, vérifier le plan de requête des notions dues. Commit `feat(SPEC-107): migre et indexe les révisions`.
3. Écrire le schéma de carte FSRS sérialisée et le repository `getDueNotionStates` ; tester les bornes, les dates et les accès croisés. Commit `test(SPEC-107): vérifie FSRS persistant et isolation`.
4. Ajouter la page SDD, le test navigateur/visuel, exécuter `validate.mjs` et compléter les preuves.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/memory.ts`, `packages/db/src/schema/memory.test.ts`, `packages/db/src/repositories/notion-states.ts`, `packages/db/migrations/NNNN_memory.sql` et copie Supabase, `packages/db/test/integration/memory.test.ts`, `apps/web/components/sdd-demos/spec-107.tsx`, `apps/web/e2e/specs/p1/spec-107.spec.ts`.
- **Modifiés** : `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`, registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `profiles`, `notions`, `answers`, migrations et `userDb` de SPEC-101.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-107` montre « États de mémorisation », trois cartes de notions avec échéance et maîtrise, « Lacune active » avec nature/instant, puis « Historique de révision » avec note et états avant/après. Les données sont des fixtures marquées « Démonstration » et l'horloge est fixée au 11 novembre 2026. `data-testid` : `spec-107-due`, `spec-107-gap`, `spec-107-history`. Les dates affichées suivent `Europe/Paris` ; le JSON FSRS brut n'est pas nécessaire à l'apprenant mais visible dans une zone technique étiquetée. Tester jetons, ordre, axe et captures desktop/mobile à 1 %.

## 11. Critères d'acceptation

- **CA-1** — Les trois tables et contraintes correspondent à `data-model.md` §6 ; états FSRS invalides et maîtrise hors bornes sont refusés.
- **CA-2** — La requête de notions dues exclut les lignes suspendues, non revues et celles d'autrui, avec ordre stable.
- **CA-3** — Révision, état courant et événement de lacune sont atomiques et résistent à deux réponses concurrentes.
- **CA-4** — L'historique conserve la version avant/après et l'état courant reflète le dernier événement.
- **CA-5** — La page SDD affiche échéance, lacune et historique, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/memory.test.ts`, `describe('[SPEC-107] memory schema')` : carte FSRS complète/invalide, bornes, nature et confusion (CA-1).
- **Intégration** — `packages/db/test/integration/memory.test.ts`, `describe('[SPEC-107] memory persistence')` : migration, requête due, transaction rollback sur erreur, réponses concurrentes, RLS de deux utilisateurs, append-only (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-107.spec.ts`, `test('inspecte les états de mémorisation @SPEC-107')` : voir trois cartes et un événement, garder la vidéo (CA-5).
- **Visuel** — `test('mémoire conforme @SPEC-107 @visual')` : structure, jetons, axe, captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-103]`, `[SPEC-106]` et tests RLS P1.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration migration |
| CA-2 | intégration requête due/RLS |
| CA-3 | intégration transaction/concurrence |
| CA-4 | intégration historique |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-107/` contient rapports, sortie de plan d'index, cas de concurrence/RLS, vidéo/captures, `checks.json` et `acceptance.md`. Aucun horodatage réel non contrôlé n'est utilisé en test.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent. Les trois tables ont RLS activée, la migration est copiée à l'identique, l'état FSRS et le journal sont cohérents après concurrence et les notions dues restent filtrées par propriétaire.

## 15. Décisions et hypothèses

ADR-0024 fixe le modèle de maîtrise/lacune et ADR-0025 FSRS par notion. Les algorithmes restent dans `@learny/learning-engine` (SPEC-402–404) ; ce schéma stocke leurs entrées/sorties sans recalcul SQL.
