---
id: SPEC-108
title: Schéma agenda, automatismes et série
phase: P1
priority: V1
depends_on: [SPEC-102, SPEC-103]
business_rules: [BR-AGE-04]
screens: []
adrs: [ADR-0029]
visual: demo
---

# SPEC-108 — Schéma agenda, automatismes et série

## 1. Objectif

Créer les tables qui conservent les créneaux planifiés, actions du tuteur automatisé, activité quotidienne et jalons. Le schéma doit représenter les cinq statuts de créneau et permettre une replanification traçable sans perdre l'origine d'un déplacement.

## 2. Contexte

`docs/architecture/data-model.md` §7 fixe les quatre tables et leurs énumérations. ADR-0029 définit un planificateur glouton déterministe qui écrira les créneaux en SPEC-407 ; les automatismes utiliseront `automation_actions` en SPEC-711 ; la série et les jalons sont calculés par SPEC-409. Lire SPEC-102/103, `docs/product/business-rules.md` BR-AGE-03/04, BR-AUT-11/12 et BR-GAM-01/03, ainsi que `docs/engineering/conventions.md` §6–§7.

## 3. Dépendances

- **SPEC-102** : `profiles` et préférences de jours/moments d'étude ; `user_id` est le propriétaire de toutes les lignes.
- **SPEC-103** : `formations` et `modules`, référencés par les créneaux et actions ; `activity_id` sera nullable jusqu'à SPEC-106 ou référencé si la migration est déjà présente.
- **SPEC-101** : Drizzle, migrations doubles et harnais de test. Les services futurs fourniront le calcul, cette spécification ne planifie rien automatiquement.

## 4. Règles métier couvertes

- **BR-AGE-04** : un créneau prend exactement l'un des états `planned` (prévu), `done` (fait), `missed` (manqué à la fin du jour local), `moved` (déplacé) ou `cancelled` (annulé). Le schéma conserve l'ancien créneau et le lien `moved_from_id` pour rendre un déplacement auditable.

## 5. Exigences fonctionnelles

- **EF-1** — `schedule_slots` stocke propriétaire, formation, module facultatif, `kind` parmi les douze activités de `data-model.md` §7, titre, méta, `starts_at`/`ends_at` UTC, statut BR-AGE-04, activité liée, créateur `planner|automation|learner`, origine d'un déplacement et jalon de groupe. Un créneau finit strictement après son début.
- **EF-2** — Le déplacement crée un nouveau créneau relié par `moved_from_id` et passe l'ancien en `moved` dans une même transaction ; un créneau fait ou annulé ne peut être déplacé par le repository. Les deux lignes conservent la formation et le propriétaire.
- **EF-3** — `automation_actions` conserve clé d'automatisme, type d'action, résumé dans le ton de l'apprenant, payload/undo payload, consentement, statut `pending_consent|applied|declined|undone|expired|consumed`, date de décision et date de création. Le journal se lit par utilisateur, du plus récent au plus ancien.
- **EF-4** — `daily_activity` a une ligne par `(user_id, day)`, minutes non négatives, indicateur `qualifying` et sources ; `day` est une date civile locale calculée par le service, sans conversion implicite SQL. La série peut relire 14 jours avec les jours neutres de SPEC-409.
- **EF-5** — `milestones` stocke les jalons `module_validated|notions_100|streak_30` avec référence facultative et instant UTC ; `unique(user_id, key, ref_id)` évite un double jalon pour le même événement.
- **EF-6** — Les repositories exposent lecture par plage `(userId, from, to)` pour l'agenda et lecture paginée des actions/jalons ; RLS empêche qu'une formation partagée donne accès aux créneaux personnels d'un autre membre.

## 6. Exigences techniques

- **ET-1** — Colonnes, valeurs des énumérations et FK conformes à `data-model.md` §7. Index `schedule_slots(user_id, starts_at)` et `automation_actions(user_id, created_at DESC)` ; le début/fin est `timestamptz`, le jour de série est `date`.
- **ET-2** — Contraintes `ends_at > starts_at`, `minutes >= 0`, `moved_from_id <> id`, `summary` non vide, statut valide par enum. Une FK auto-référente protège `moved_from_id` ; la cohérence du propriétaire/origine est vérifiée transactionnellement.
- **ET-3** — Activer RLS sur les quatre tables à la création avec politiques `user_id = auth.uid()`. Le rôle service n'est utilisé que par les jobs de planification/automatisation explicitement désignés dans les spécifications futures.
- **ET-4** — Ne pas calculer l'état `missed` par un défaut SQL dépendant de l'heure du serveur ; le cron et le fuseau utilisateur de SPEC-203/207 font la transition. Les timestamps sont UTC selon `conventions.md` §6.
- **ET-5** — Les tableaux `sources` et les JSON `payload`/`undo_payload` sont validés à l'entrée par Zod ; le schéma des paramètres par automatisme sera ajouté par SPEC-711.
- **ET-6** — Migration générée avec Drizzle, copiée à l'identique dans `supabase/migrations` ; exports de types depuis `packages/db/src/schema/index.ts`.

## 7. Comportements attendus et cas limites

- **CL-1** — Fin égale ou antérieure au début : refus SQL, aucune ligne.
- **CL-2** — Double déplacement simultané : un seul nouveau créneau actif ; la transaction concurrente échoue en conflit/recharge.
- **CL-3** — Ancien créneau déplacé supprimé : FK protège la traçabilité ; la suppression du compte propriétaire emporte les deux lignes.
- **CL-4** — Action `undone` sans `undo_payload` : le service refuse l'annulation ; la ligne historique reste lisible.
- **CL-5** — Deux écritures du même jour d'activité : `upsert` additionne les minutes de façon atomique et déduplique la source d'événement.
- **CL-6** — Même jalon inséré deux fois : contrainte unique/idempotence, une seule notification future.
- **CL-7** — Membre de groupe : il voit le programme commun mais pas `schedule_slots`/`daily_activity`/`automation_actions` d'autrui.
- **CL-8** — Changement d'heure été/hiver : les instants restent UTC ; le calcul du jour local vient de SPEC-207.

## 8. Instructions d'implémentation

1. Créer énumérations, quatre tables, contraintes et index dans `packages/db/src/schema/planning.ts` ; exporter les types. Commit `feat(SPEC-108): crée agenda actions et série`.
2. Générer/coller la migration Supabase et activer RLS propriétaire ; vérifier les FK vers formation/module. Commit `feat(SPEC-108): migre et protège les données de planning`.
3. Ajouter repositories de déplacement transactionnel, lecture par plage et mise à jour quotidienne ; écrire les tests de concurrence et accès croisé. Commit `test(SPEC-108): vérifie statuts et traçabilité`.
4. Ajouter démonstration SDD, e2e et test visuel ; exécuter validation et renseigner les preuves.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/planning.ts`, `packages/db/src/schema/planning.test.ts`, `packages/db/src/repositories/schedule-slots.ts`, `packages/db/src/repositories/automation-actions.ts`, `packages/db/migrations/NNNN_planning.sql` et copie Supabase, `packages/db/test/integration/planning.test.ts`, `apps/web/components/sdd-demos/spec-108.tsx`, `apps/web/e2e/specs/p1/spec-108.spec.ts`.
- **Modifiés** : `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`, registre SDD, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `profiles`, `formations`, `modules`, `study_preferences` et harnais de SPEC-101.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-108` affiche « Créneaux » avec un créneau prévu, son prédécesseur déplacé et leur lien, « Action du tuteur » avec statut/consentement, « Activité du jour » avec minutes, puis « Jalons ». `data-testid` : `spec-108-slots`, `spec-108-action`, `spec-108-daily`, `spec-108-milestones`. Les cinq statuts de BR-AGE-04 sont listés avec libellés français et pas seulement des couleurs. Les dates suivent le fuseau utilisateur. Tester jetons, ordre, axe, captures desktop/mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Les quatre tables et énumérations sont migrées ; les cinq statuts de BR-AGE-04 sont représentables, une plage invalide est rejetée.
- **CA-2** — Un déplacement conserve le lien et interdit deux nouveaux créneaux actifs lors d'une concurrence.
- **CA-3** — Une activité quotidienne et un jalon ne sont pas doublés après relecture du même événement.
- **CA-4** — Un utilisateur ne lit ni n'écrit les créneaux/actions/activité d'un autre, y compris en formation à plusieurs.
- **CA-5** — La démonstration présente les quatre régions, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/planning.test.ts`, `describe('[SPEC-108] planning schema')` : enums, bornes, formes JSON et états de transition (CA-1, CA-2).
- **Intégration** — `packages/db/test/integration/planning.test.ts`, `describe('[SPEC-108] planning persistence')` : migration, déplacement concurrent, `upsert` du jour, unicité du jalon et RLS à deux utilisateurs (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-108.spec.ts`, `test('inspecte le schéma du planning @SPEC-108')` : voir lien de déplacement, action et jalon, vidéo (CA-5).
- **Visuel** — `test('planning conforme @SPEC-108 @visual')` : jetons, structure, axe, captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-102]`, `[SPEC-103]` et RLS P1.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration migration |
| CA-2 | intégration concurrence |
| CA-3 | intégration idempotence |
| CA-4 | intégration RLS |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-108/` contient rapports, résultat SQL des contraintes, traces de concurrence et RLS, vidéo/captures, `checks.json` et `acceptance.md` avec chaque CA relié à une preuve.

## 14. Définition de terminé

Les contrôles de `docs/engineering/testing.md` §7 passent ; la migration est copiée, RLS active, les déplacements traçables et aucune écriture concurrente ne crée deux créneaux actifs pour une opération unique.

## 15. Décisions et hypothèses

ADR-0029 fixe le planificateur et les moments d'étude ; ce schéma ne calcule ni la replanification ni la série. SPEC-207 fixera les conversions de fuseau et SPEC-113 audite les politiques RLS.
