---
id: SPEC-209
title: Service unifié de notifications
phase: P2
priority: V1
depends_on: [SPEC-204, SPEC-205, SPEC-207, SPEC-109]
business_rules: [BR-NOT-03, BR-NOT-05, BR-NOT-06, BR-ACC-05]
screens: []
adrs: [ADR-0031, ADR-0010]
visual: demo
---

# SPEC-209 — Service unifié de notifications

## 1. Objectif

Fournir le point d'entrée unique `notify(userId, type, data)` qui crée la notification dans l'application, puis décide pour chaque canal externe (e-mail, navigateur) s'il faut envoyer, reporter ou écarter, en respectant préférences, heures calmes, week-end et plafond quotidien. Livrer aussi le programme du jour, qui résume les envois écartés la veille.

## 2. Contexte

Les producteurs de notifications (SPEC-612, SPEC-706, automatismes SPEC-711 à SPEC-721, SPEC-723) appellent tous ce service ; aucun n'écrit directement dans `notification_deliveries`. Lire `docs/product/business-rules.md` BR-NOT-01 à BR-NOT-08 et BR-ACC-05, `docs/architecture/data-model.md` §1 et §8 (`notification_settings`, `notifications`, `notification_deliveries`), ADR-0031 (plafond), ADR-0010 (ton), ADR-0032 et ADR-0124 (catégories d'e-mails), ADR-0123 (fenêtres locales, heures calmes), ADR-0067 (crons par fuseau), ADR-0214 (ordre des contrôles, correspondance type → préférence, report), `docs/architecture/overview.md` §5 (événements).

## 3. Dépendances

- **SPEC-109** : tables `notifications` (`unique(user_id, dedupe_key)`, `href` interne) et `notification_deliveries` (statuts `scheduled|sent|deferred_quiet|capped|failed|skipped_pref`).
- **SPEC-102** (transitive) : `notification_settings` avec les défauts BR-NOT-04 et `profiles.tutor_tone`, `profiles.timezone`.
- **SPEC-204** : `sendEmail`, gabarits `reminder`, `daily_digest`, `weekly_review`, `ai_task_failed`, `canSendServiceEmail`, transport mémoire en test.
- **SPEC-205** : `sendPush(userId, notification)`, outbox mock, nettoyage des abonnements.
- **SPEC-207** : `isQuietHours`, `nextOutsideQuietHours`, `startOfUserDay`, `userWeekday`, horloge injectable.
- **SPEC-203** (transitive) : `cron/hourly-tick`, `dueInWindow`, `step.sleepUntil`, boîte d'envoi `event_outbox`.
- **Externe** : aucune au-delà de SPEC-204/205 ; en test `EMAIL_MODE=memory` et push mock.

## 4. Règles métier couvertes

- **BR-NOT-03** : la notification in-app est toujours créée, quel que soit le réglage ; l'e-mail et le navigateur ne partent que si leur canal (`channel_email`, `channel_push`) et le type sont activés, sinon livraison `skipped_pref`.
- **BR-NOT-05** : avant chaque envoi externe, le service compte les livraisons `sent` du jour local (e-mail et navigateur confondus, une notification comptée une fois) ; au-delà de `max_per_day` (3, 5 ou 8), la livraison passe `capped` et le titre est repris le lendemain dans le bloc « En attente dans l'application » du programme du jour.
- **BR-NOT-06** : pendant les heures calmes, aucun envoi externe ; la livraison passe `deferred_quiet` avec `scheduled_for` = fin des heures calmes, puis est réévaluée ; devenue sans objet (`staleAt` dépassé ou notification lue), elle est abandonnée.
- **BR-ACC-05** : titres et textes des notifications sont produits par des gabarits à deux variantes `vous`/`tu` choisies selon `profiles.tutor_tone` ; les libellés fixes (boutons, liens) restent au vouvoiement.

## 5. Exigences fonctionnelles

- **EF-1** — `notify({ userId, type, formationId?, data, dedupeKey?, eligibleAt?, staleAt? })` crée une ligne `notifications` (titre, texte, `href`, icône calculés par le gabarit du type) et renvoie `{ notificationId, created: boolean, deliveries: { channel, status, scheduledFor }[] }`. Avec une `dedupeKey` déjà utilisée par cet utilisateur, aucune nouvelle ligne ni livraison n'est créée (`created: false`).
- **EF-2** — Ordre des contrôles par canal (ADR-0214) : préférence de canal ou de type → week-end → heures calmes → plafond → envoi. Chaque décision écrit une ligne `notification_deliveries` avec son statut ; `eligibleAt` futur produit `scheduled` à cette date.
- **EF-3** — Correspondance type → interrupteur : `global_quiz_today` → `type_revision` ; `validation_soon`, `module_validated` → `type_validation` ; `course_ready` → `type_course` ; `new_gap` → `type_gap` ; `session_planned`, `session_to_reschedule`, `planning_adjusted` → `type_planning` ; `relaunch` → `type_relaunch` ; les autres types sont toujours actifs (seul le canal compte).
- **EF-4** — Week-end : samedi et dimanche locaux avec `weekend_quiet = true`, seuls les `global_quiz_today` (révisions dues) partent ; les autres sont reportés au lundi local, fin des heures calmes.
- **EF-5** — Le job `notifications-deferred-due` (tick horaire) réévalue toutes les livraisons `scheduled` et `deferred_quiet` échues, avec les mêmes contrôles ; il n'envoie jamais deux fois la même livraison.
- **EF-6** — Programme du jour : à `digest_time` local (défaut 08:00), le job `notifications-daily-digest` crée la notification `daily_digest` et envoie l'e-mail `daily_digest` (si `channel_email`) avec les activités du jour (au plus 20, puis « et {n} autres dans l'agenda » dans `plannedLabel`) et le bloc `held` listant au plus 10 titres des livraisons `capped` de la veille locale. Le programme du jour ne compte pas dans le plafond.
- **EF-7** — Un échec de transport passe la livraison `failed` avec `error` ; l'e-mail est retenté selon la politique Inngest (3 essais), le push selon SPEC-205 ; une livraison `failed` ne compte pas dans le plafond.
- **EF-8** — La page `/_dev/sdd/SPEC-209` permet de choisir type, ton, heure simulée et réglages (canaux, heures calmes, week-end, plafond), d'appeler `notify` et d'afficher la notification créée et les livraisons par canal avec leur statut et leur date.

## 6. Exigences techniques

- **ET-1** — `packages/notifications/src/notify.ts` exporte `notify(sctx: SystemContext, input: NotifyInput): Promise<Result<NotifyResult>>` ; `NotifyInput` est validé par Zod dans `packages/contracts/src/notifications.ts` (`type` ∈ énumération `notification_type`, `href` chemin relatif commençant par `/`, `dedupeKey` ≤ 200 caractères).
- **ET-2** — `packages/notifications/src/templates/` contient un gabarit par type `{ icon, title(data, tone), body(data, tone), href(data), emailTemplate: 'reminder' | 'weekly_review' | 'ai_task_failed' | null }` ; titre ≤ 120 caractères, texte ≤ 400 (bornes de SPEC-109) ; un test lexical vérifie qu'aucune variante `tu` ne contient « vous », « votre », « vos ».
- **ET-3** — `packages/notifications/src/routing.ts` exporte la fonction pure `decideDelivery({ channel, type, settings, now, timeZone, sentToday }): { status, scheduledFor }`, testée exhaustivement ; le service ne contient pas d'autre logique de décision.
- **ET-4** — Création de la notification et des livraisons dans une seule transaction (`serviceDb`, opération autorisée ADR-0110) ; envoi effectif après commit par l'événement `notification/delivery-due` (boîte d'envoi ADR-0122), idempotent sur `deliveryId`.
- **ET-5** — Compte du plafond par requête `count(distinct notification_id)` sur `notification_deliveries` `sent` entre `startOfUserDay` et `endOfUserDay` du fuseau, sous verrou consultatif `pg_advisory_xact_lock(hash(userId))` pour éviter de dépasser le plafond par concurrence.
- **ET-6** — Jobs `notifications-deferred-due` et `notifications-daily-digest` dans `packages/jobs/src/functions/`, déclenchés par `cron/hourly-tick` ; le programme du jour utilise `dueInWindow(digest_time)` puis `step.sleepUntil` ; idempotence `digest:<userId>:<date locale>`.
- **ET-7** — Les e-mails de catégorie `service` vérifient `channel_email` ici (SPEC-204 ne le fait pas) ; aucune notification ne déclenche d'e-mail transactionnel (export et suppression sont envoyés directement par SPEC-211).

## 7. Comportements attendus et cas limites

- **CL-1** — Notification à 22:30 heure de Paris, heures calmes 21:00–08:00 : in-app créée, e-mail et push `deferred_quiet` pour 08:00 locale le lendemain.
- **CL-2** — Plafond 5 atteint : 6ᵉ notification in-app créée, livraisons `capped` ; le programme du jour suivant contient « 1 notification n'a pas été envoyée hier pour respecter votre limite de 5 par jour ».
- **CL-3** — Deux appels concurrents à 4 envois déjà faits (plafond 5) : un seul `sent`, l'autre `capped`.
- **CL-4** — Même `dedupeKey` rappelée : aucune ligne nouvelle, aucune livraison, `created: false`.
- **CL-5** — Notification lue avant la fin des heures calmes : la livraison reportée est abandonnée (`skipped_pref`, `error = 'stale'`).
- **CL-6** — Passage à l'heure d'hiver pendant les heures calmes : report calculé par `nextOutsideQuietHours`, instant réel unique, pas de double envoi.
- **CL-7** — `channel_push` actif mais aucun abonnement : livraison `skipped_pref`, `error = 'no_subscription'`.
- **CL-8** — Utilisateur au ton `tu` : titre et texte en tutoiement, bouton « Ouvrir » inchangé.
- **CL-9** — Samedi local, `weekend_quiet` actif : `global_quiz_today` envoyé, `course_ready` reporté au lundi 08:00 locale.
- **CL-10** — Heures calmes avec début = fin : aucune heure calme (ADR-0123), envoi immédiat.

## 8. Instructions d'implémentation

1. Contrats Zod et gabarits par type avec variantes de ton. Commit `feat(SPEC-209): gabarits de notification par type`.
2. Fonction pure `decideDelivery` et tests exhaustifs (table de décision). Commit `feat(SPEC-209): décide le routage par canal`.
3. `notify` transactionnel (création, déduplication, livraisons, verrou de plafond, événement après commit). Commit `feat(SPEC-209): service notify`.
4. Fonction d'envoi `notification/delivery-due` (e-mail via SPEC-204, push via SPEC-205), job `notifications-deferred-due`. Commit `feat(SPEC-209): envoie et reporte les livraisons`.
5. Job `notifications-daily-digest` (activités, quiz global, bloc `held`). Commit `feat(SPEC-209): programme du jour`.
6. Page SDD, route de démonstration `/api/v1/dev/sdd/notify`, tests e2e/visuels. Commit `test(SPEC-209): démontre le routage`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/notifications.ts`, `packages/notifications/src/{notify,routing,index}.ts`, `packages/notifications/src/templates/{index,<type>}.ts`, `packages/notifications/src/routing.test.ts`, `packages/notifications/src/templates/templates.test.ts`, `packages/notifications/test/integration/notify.test.ts`, `packages/jobs/src/functions/{notification-delivery,notifications-deferred-due,notifications-daily-digest}.ts`, `apps/web/app/api/v1/dev/sdd/notify/route.ts`, `apps/web/components/sdd-demos/spec-209.tsx`, `apps/web/e2e/specs/p2/spec-209.spec.ts`.
- **Modifiés** : `packages/notifications/package.json` (export `./notify`), `packages/jobs/src/{events,registry}.ts`, `packages/contracts/src/index.ts`, registre SDD, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `sendEmail`, `canSendServiceEmail` (SPEC-204), `sendPush` (SPEC-205), fonctions de `packages/core/src/time.ts` (SPEC-207), tables SPEC-109/102.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-209`, `h1` « SPEC-209 — Service unifié de notifications ». Régions :
1. « Réglages simulés » (`spec-209-settings`) : interrupteurs E-mail / Navigateur, champs heures calmes, case « Rien le week-end, sauf les révisions dues », contrôle segmenté plafond 3/5/8, sélecteur de ton.
2. « Envoi » (`spec-209-send`) : sélecteur de type (16 types), sélecteur d'heure simulée (mercredi 11/11 13:20, 22:30, samedi 10:00), bouton « Notifier ».
3. « Résultat » (`spec-209-result`, `role="status"`) : carte de la notification (icône, titre, texte, lien) et tableau des livraisons (canal, statut en français : « Envoyée », « Reportée (heures calmes) », « Écartée (plafond) », « Non envoyée (préférence) », « Échec », « Planifiée », date locale).
4. « Programme du jour » (`spec-209-digest`) : aperçu du bloc « En attente dans l'application ».
Clavier, 390 px, jetons SPEC-301. Contrôles : jetons, ordre, axe, captures desktop/mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Pour les 16 types et toutes les combinaisons de préférences de canal/type, la notification in-app est créée et chaque livraison externe porte le statut prévu par la table de décision d'ADR-0214.
- **CA-2** — Aucun envoi externe pendant les heures calmes ni le week-end (hors révisions dues) ; les reports partent à la fin des heures calmes et sont abandonnés s'ils sont devenus sans objet.
- **CA-3** — Le plafond quotidien n'est jamais dépassé, y compris sous concurrence, et les envois écartés figurent dans le programme du jour suivant.
- **CA-4** — Une même `dedupeKey` ne produit qu'une notification et qu'un jeu de livraisons ; un événement rejoué n'envoie rien deux fois.
- **CA-5** — Les textes respectent le ton du profil (`vous`/`tu`) et aucune variante `tu` ne contient de vouvoiement.
- **CA-6** — La page SDD démontre réglages, résultat et programme du jour ; vidéo, axe et captures ≤ 1 %.

## 12. Plan de tests

- **Unitaires** — `packages/notifications/src/routing.test.ts`, `describe('[SPEC-209] décision de livraison')` : table complète préférences × week-end × heures calmes × plafond, DST, début = fin (CA-1, CA-2). `templates.test.ts`, `describe('[SPEC-209] gabarits')` : 16 types × 2 tons, bornes, test lexical (CA-5).
- **Intégration** — `packages/notifications/test/integration/notify.test.ts`, `describe('[SPEC-209] notify')` : base locale, transport mémoire et push mock ; déduplication, report puis envoi par `notifications-deferred-due`, abandon après lecture, plafond sous 10 appels concurrents, programme du jour avec bloc `held`, échec de transport (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p2/spec-209.spec.ts`, `test('routage des notifications @SPEC-209')` : 22:30 → « Reportée (heures calmes) » ; plafond 3 et quatre envois → « Écartée (plafond) » puis bloc du programme du jour ; vidéo (CA-6).
- **Visuel** — `test('notifications conformes @SPEC-209 @visual')` : régions, jetons, axe, captures ≤ 1 % (CA-6).
- **Non-régression** — `[SPEC-109]`, `[SPEC-204]` / `@SPEC-204`, `[SPEC-205]` / `@SPEC-205`, `[SPEC-207]`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires décision ; intégration notify |
| CA-2 | unitaires heures calmes/week-end ; intégration report |
| CA-3 | intégration concurrence et programme du jour |
| CA-4 | intégration déduplication et rejeu |
| CA-5 | unitaires gabarits |
| CA-6 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-209/` : rapports, table de décision générée (`routing-table.md`), journal des livraisons d'un scénario sur 48 h simulées, outbox e-mail et push du scénario, vidéo, captures desktop/mobile, `checks.json`, `acceptance.md`. Aucune adresse e-mail réelle.

## 14. Définition de terminé

Validations communes de `docs/engineering/testing.md` §7 ; en plus : aucun appel direct à `sendEmail` ou `sendPush` hors de `packages/notifications` et de SPEC-211 (contrôlé par une règle ESLint `no-restricted-imports`), et CP-2 peut démontrer heures calmes et plafond.

## 15. Décisions et hypothèses

- ADR-0031 (plafond hors application), ADR-0010 (ton), ADR-0032 et ADR-0124 (catégories et préférence e-mail), ADR-0123 (heures calmes, week-end, DST).
- ADR-0214 (créé pour cette spécification) : ordre des contrôles, correspondance type → interrupteur, règle du week-end, comptage du plafond, abandon des reports périmés, programme du jour hors plafond.
- Hypothèse : le rappel 40 minutes avant un quiz (BR-NOT-07) est calculé par SPEC-706, qui transmet `eligibleAt` ; ce service ne connaît pas l'agenda.
