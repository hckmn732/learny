---
id: SPEC-109
title: Schéma notifications
phase: P1
priority: V1
depends_on: [SPEC-102]
business_rules: [BR-NOT-04]
screens: []
adrs: [ADR-0031]
visual: demo
---

# SPEC-109 — Schéma notifications

## 1. Objectif

Créer la boîte de notifications de chaque apprenant et le journal des livraisons e-mail/navigateur, avec déduplication et états de report ou de plafonnement. Le schéma doit permettre la lecture des non-lues et préserver la trace d'un envoi non effectué sans l'afficher comme livré.

## 2. Contexte

`docs/architecture/data-model.md` §8 définit `notifications` et `notification_deliveries` ; SPEC-102 fournit `notification_settings` avec les valeurs par défaut de BR-NOT-04. ADR-0031 distingue notifications dans l'application (non plafonnées) et envois hors application (plafond 3/5/8, défaut 5), calculés par SPEC-209. Lire `docs/product/business-rules.md` BR-NOT-01 à BR-NOT-07, `docs/architecture/api.md` §2, SPEC-101 et `docs/engineering/testing.md` §3. Cette spécification stocke les événements ; elle ne choisit pas le canal ni les textes.

## 3. Dépendances

- **SPEC-102** : `profiles`, `notification_settings` et valeurs par défaut de canaux, types, heure du digest et heures calmes.
- **SPEC-101** : Drizzle, migration Supabase, `userDb` et transaction de test.
- **SPEC-103** : `formations` peut être référencée de façon facultative ; une notification de compte n'a pas de formation.
- Aucun transport e-mail/push n'est nécessaire pour migrer et tester les tables.

## 4. Règles métier couvertes

- **BR-NOT-04** : le schéma de réglages de SPEC-102 doit conserver e-mail et navigateur activés, tous les types activés, digest 08:00, heures calmes 21:00–08:00 et silence du week-end sauf révisions dues. Les notifications et livraisons de cette spécification référencent ces réglages mais ne les réinitialisent pas ; un test d'intégration vérifie les défauts et leur effet sur les lignes de livraison préparées.

## 5. Exigences fonctionnelles

- **EF-1** — `notifications` stocke `user_id`, `formation_id` facultatif, `type` parmi les 16 types de `data-model.md` §8, titre, corps, `href` interne, icône, `dedupe_key` facultative, `read_at` et `created_at`. Une ligne représente une notification visible dans l'application, même si les canaux externes sont désactivés.
- **EF-2** — `unique(user_id, dedupe_key)` empêche un même événement de créer deux notifications pour l'apprenant ; une clé nulle autorise des événements distincts. Un nouvel envoi avec la même clé retourne la ligne existante sans réinitialiser `read_at`.
- **EF-3** — `notification_deliveries` lie une notification à un canal `email|push`, un état `scheduled|sent|deferred_quiet|capped|failed|skipped_pref`, `scheduled_for`, `sent_at` et erreur sûre. Le statut `sent` exige un horodatage d'envoi ; `capped` ou `skipped_pref` ne le porte pas.
- **EF-4** — La lecture paginée de la boîte renvoie les lignes les plus récentes, avec filtre `all|unread` ; le compteur non lu est calculé sur `read_at IS NULL`. `markRead(id,userId)` et `markAllRead(userId)` ne changent que les lignes du propriétaire.
- **EF-5** — Un index `(user_id, created_at DESC)` soutient la pagination ; un index partiel `(user_id) WHERE read_at IS NULL` soutient le badge non lu. Le journal de livraison est consultable par notification et canal pour diagnostic, jamais exposé à un autre apprenant.
- **EF-6** — La page SDD illustre un digest, une lacune et une livraison différée par heures calmes, avec le compteur non lu calculé à partir des lignes de fixture.

## 6. Exigences techniques

- **ET-1** — Énumérations `notification_type` et `delivery_status` et les deux tables selon `data-model.md` §8 ; UUID, FK propriétaire `on delete cascade`, `created_at` UTC et `read_at/scheduled_for/sent_at` en `timestamptz`.
- **ET-2** — Contrainte `unique(user_id, dedupe_key)` ; `href` est un chemin relatif interne validé par Zod (pas d'URL externe ou `javascript:`). `title`/`body` non vides et bornés selon le contrat du service de SPEC-209.
- **ET-3** — Le repository `createNotification` utilise `insert ... on conflict (user_id,dedupe_key) do nothing` puis relit la ligne ; la transaction ne duplique pas le journal de livraison après conflit.
- **ET-4** — RLS activée sur les deux tables dès migration ; l'utilisateur lit/met à jour ses notifications, les livraisons sont écrites par le service de notifications et lisibles par le propriétaire. SPEC-113 auditera la matrice complète.
- **ET-5** — Les mises à jour de statut de livraison sont monotones : une ligne `sent` ne redevient pas `scheduled` ; une erreur est un code sûr, sans adresse e-mail, endpoint push ni contenu de token.
- **ET-6** — Migration Drizzle et copie identique Supabase, exports de types depuis `@learny/db` ; les tests utilisent deux JWT distincts et la transaction `withRollback`.

## 7. Comportements attendus et cas limites

- **CL-1** — Deux jobs créent la même `dedupe_key` en parallèle : une seule notification et au plus une livraison par canal/événement.
- **CL-2** — Même clé pour deux utilisateurs : deux lignes indépendantes autorisées.
- **CL-3** — Notification déjà lue créée de nouveau par erreur : `read_at` ne redevient pas nul.
- **CL-4** — `href` externe ou dangereux : refus avant insertion.
- **CL-5** — Statut `sent` sans `sent_at` : refus ; statut `capped` avec `sent_at` : refus.
- **CL-6** — Préférence e-mail/push désactivée : ligne in-app conservée, livraison `skipped_pref` ou absente selon SPEC-209, jamais marquée `sent`.
- **CL-7** — Accès à l'ID d'une notification d'autrui : 0 ligne affectée et aucune information sur son existence.
- **CL-8** — Fuseau et heures calmes : `scheduled_for` reste UTC ; le calcul du prochain envoi appartient à SPEC-207/209.

## 8. Instructions d'implémentation

1. Définir enums et tables dans `packages/db/src/schema/notifications.ts`, contraintes et index. Commit `feat(SPEC-109): crée la boîte et les livraisons`.
2. Générer/coller la migration Supabase, activer RLS et tester l'isolation. Commit `feat(SPEC-109): migre et protège les notifications`.
3. Créer les repositories de création idempotente, lecture paginée, compteur et lecture ; ajouter tests de concurrence et défauts SPEC-102. Commit `test(SPEC-109): vérifie déduplication et préférences`.
4. Ajouter la page de démonstration et e2e/visuel, puis valider et documenter les preuves.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/notifications.ts`, `packages/db/src/schema/notifications.test.ts`, `packages/db/src/repositories/notifications.ts`, `packages/db/migrations/NNNN_notifications.sql` et copie Supabase, `packages/db/test/integration/notifications.test.ts`, `apps/web/components/sdd-demos/spec-109.tsx`, `apps/web/e2e/specs/p1/spec-109.spec.ts`.
- **Modifiés** : `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`, registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `profiles`, `notification_settings` et harnais SPEC-101.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-109` affiche « Notifications », badge « 2 non lues », liste de trois lignes (digest, lacune, autre), puis « Livraisons » avec `sent`, `deferred_quiet` et `skipped_pref` traduits. `data-testid` : `spec-109-count`, `spec-109-list`, `spec-109-deliveries`. La démonstration utilise des fixtures sans adresse e-mail ni endpoint push ; chaque statut a texte et icône. Test jetons, ordre, axe, capture desktop/mobile à 1 %.

## 11. Critères d'acceptation

- **CA-1** — Les deux tables, enums, contraintes et index correspondent au modèle ; une livraison incohérente est refusée.
- **CA-2** — Deux insertions concurrentes avec même clé créent une seule notification et ne réinitialisent pas la lecture.
- **CA-3** — Les défauts BR-NOT-04 de SPEC-102 restent disponibles ; le compteur et le filtre non lu donnent les valeurs attendues.
- **CA-4** — Un second utilisateur ne lit ni ne modifie notifications/livraisons d'autrui.
- **CA-5** — La page SDD affiche compteur, liste et livraisons, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/notifications.test.ts`, `describe('[SPEC-109] notification schema')` : types, href interne, états/horodatages et règles de déduplication (CA-1).
- **Intégration** — `packages/db/test/integration/notifications.test.ts`, `describe('[SPEC-109] notification persistence')` : migration, deux inserts concurrents, lecture, compteur, défauts SPEC-102 et RLS (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-109.spec.ts`, `test('inspecte les notifications @SPEC-109')` : vérifier badge, trois lignes et livraison différée, vidéo (CA-5).
- **Visuel** — `test('notifications conformes @SPEC-109 @visual')` : structure, jetons, axe, captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-102]` et tests d'isolation P1.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration migration |
| CA-2 | intégration concurrence |
| CA-3 | intégration défauts/compteur |
| CA-4 | intégration RLS |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-109/` contient rapports, requêtes de déduplication/compteur et RLS, vidéo/captures, `checks.json` et `acceptance.md`. Aucune adresse de livraison réelle n'est conservée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent ; migration copiée, RLS active, clé de déduplication atomique et états de livraison cohérents. Les textes et le routage des notifications restent à SPEC-209.

## 15. Décisions et hypothèses

ADR-0031 fixe le plafond des canaux externes, pas de l'in-app. Les défauts BR-NOT-04 sont stockés par SPEC-102 ; cette spécification les réutilise sans les altérer. SPEC-209 décidera de chaque livraison à partir de ces réglages.

- **ADR-0244** : journal unique par `(notification_id, channel)` (idempotence du rejeu, CL-1) ; `href` interne vérifié en base et par Zod ; `sent` équivalent à `sent_at` non nul et final par déclencheur ; `error` réduit à un code sûr ; RLS `all` sur les notifications du propriétaire et `select` seul sur les livraisons, écrites par le service. Les bornes `title ≤ 120` et `body ≤ 400` reprennent le contrat de SPEC-209 ET-2.

