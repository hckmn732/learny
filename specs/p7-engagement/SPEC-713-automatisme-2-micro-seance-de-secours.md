---
id: SPEC-713
title: "Automatisme 2 : micro-séance de secours"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-703]
business_rules: [BR-AUT-02]
screens: [SCR-10]
adrs: [ADR-0190, ADR-0192]
visual: tokens
---

# SPEC-713 — Automatisme 2 : micro-séance de secours

## 1. Objectif

Livrer l'automatisme `micro_seance` : à l'heure H locale, si aucune activité de la journée n'a été faite, proposer une micro-séance de D minutes (cartes de rappel et une question) par une notification et un créneau d'agenda, avec un lien direct vers le quiz global en mode micro ; la micro-séance faite conserve la série et consomme l'action.

## 2. Contexte

Deuxième automatisme du groupe « Contre le décrochage ». La micro-séance elle-même (sélecteur « Séance complète / Micro-séance », session courte, écran de fin) est livrée par SPEC-703 sur l'écran SCR-10 (`design/maquettes/QuizGlobal.dc.html`) ; cette spécification ajoute le déclenchement automatique, la notification, le créneau, l'effet sur la série et le journal.

À lire : BR-AUT-02, BR-AUT-11, BR-GAM-01, BR-NOT-02/05/06, BR-MEM-08 ; `docs/architecture/data-model.md` §7 et §8 ; `design/maquettes/QuizGlobal.dc.html` (sélecteur `role="group"` « Durée de la séance », `modeNote` micro) ; `design/maquettes/Parametres.dc.html` (automatisme `micro`, « Dernière action » : « lundi 20:00, micro-séance de 5 min faite : série conservée. ») ; `design/maquettes/Main.dc.html` (entrée « Micro-séance » de la carte « Le tuteur a agi pour vous ») ; ADR-0031, ADR-0033, ADR-0067, ADR-0190, ADR-0192.

## 3. Dépendances

- **SPEC-711** : moteur, contrat ADR-0190, `notify` via le moteur, `markConsumed`.
- **SPEC-703** : `GET /api/v1/formations/:fid/global-quiz/today?mode=micro`, composant de sélection de mode, comptage pour la série (BR-GAM-01 via `daily_activity`, SPEC-411).
- Utilisés : SPEC-409 (série), SPEC-209 (notifications), SPEC-207 (heure locale), SPEC-406 (contenu de la session micro).
- Aucune dépendance externe ; aucun appel IA.

## 4. Règles métier couvertes

- **BR-AUT-02** : définition `micro_seance` déclenchée par le tick horaire à l'heure `hour` (défaut 20 ; 19/20/21) si aucune activité de la journée n'est faite ; session courte de `durationMin` minutes (défaut 5 ; 3/5/10) ; la faire compte pour la série (activité qualifiante « micro-séance », BR-GAM-01) et consomme l'action.

## 5. Exigences fonctionnelles

- **EF-1 Paramètres** (`MicroSeanceParams`) : `hour ∈ {19,20,21}` défaut 20 ; `durationMin ∈ {3,5,10}` défaut 5. Libellés (SPEC-710) : « Proposée à » (« 19:00 », « 20:00 », « 21:00 ») et « Durée » (« 3 min », « 5 min », « 10 min »).
- **EF-2 Condition de déclenchement**, évaluée au tick dont l'heure locale vaut `hour` :
  1. aujourd'hui (fuseau de l'utilisateur) est un jour d'étude du rythme du profil ;
  2. aucune ligne `daily_activity` du jour n'a `qualifying = true` et aucun créneau du jour n'est `done` ;
  3. au moins une formation active (non en pause, non terminée sauf entretien léger) a une session micro non vide (`buildDailySession({ mode: 'micro' })` de SPEC-406 renvoie ≥ 1 élément).
  La formation retenue est `profiles.current_formation_id` si elle remplit (3), sinon la formation active de `last_opened_at` le plus récent qui la remplit.
- **EF-3 Action** : `kind = 'micro_session_proposed'`, `requiresConsent = false`, `formationId`, `payload = { dedupeKey: 'micro:<AAAA-MM-JJ>', date, hour, durationMin, notionCount }`, `expiresAt` = fin du jour local. `apply` crée un créneau `schedule_slots` `kind = 'micro_session'`, titre « Micro-séance de secours », `meta` « {D} min · ajoutée par le tuteur », de `hour:00` à `hour:00 + D` minutes, `created_by = 'automation'` ; `undoPayload = { slotId }`.
- **EF-4 Notification** : type `global_quiz_today` (préférence `type_revision`), `dedupeKey` de l'action, titre « Micro-séance de secours », texte « Pas eu le temps aujourd'hui ? {D} minutes de cartes de rappel suffisent pour garder votre série. » (tu : « Pas eu le temps aujourd'hui ? {D} minutes de cartes de rappel suffisent pour garder ta série. »), lien `/formations/<fid>/quiz-global?mode=micro`, `expiresAt` = fin du jour local (un envoi reporté au-delà est supprimé, BR-NOT-06).
- **EF-5 Lien profond** : `/formations/<fid>/quiz-global?mode=micro` ouvre l'écran avec « Micro-séance · {D} min » sélectionné (`aria-pressed="true"`), la note « Version courte de secours : une carte de rappel et une question. Elle garde le rythme et la série les jours chargés. » et le lien « Régler » vers `/parametres#automatismes`. Si SPEC-703 ne lit pas encore `?mode=micro`, l'ajouter. Le libellé du mode reflète `durationMin`.
- **EF-6 Consommation** : à la complétion d'une session `mode = micro` (`POST /review-sessions/:sid/complete`) le jour de l'action, ou de toute autre activité qualifiante ce jour-là, le service appelle `markConsumed` ; le créneau passe `done` si la micro-séance est faite.
- **EF-7 Expiration** : non consommée à la fin du jour local → `expired` (tick de minuit du moteur) ; le créneau passe `missed` sans être replacé (ADR-0192 §1).
- **EF-8 Explications** (`explain`) :
  - `applied` : « Micro-séance de {D} min proposée à {H}:00 pour garder votre série. » (tu : « … garder ta série. »).
  - `consumed` : « Micro-séance de {D} min proposée et faite : série conservée. » ; carte d'accueil : « {Jour} {H}:00, micro-séance de {D} min faite : votre série est conservée. » (tu : « … ta série est conservée. ») ; dernière action (SPEC-710) : « {jour} {H}:00, micro-séance de {D} min faite : série conservée. ».
  - `expired` : « Micro-séance de {D} min proposée à {H}:00, non faite. ».
  - `undone` : « Annulé : micro-séance de {D} min du {jour}. ».
- **EF-9 Annulation** : avant consommation, `undo` passe le créneau `cancelled` et marque la notification in-app lue ; après consommation, impossible (`AUTOMATION_ACTION_CONSUMED`).

## 6. Exigences techniques

- **ET-1 Schéma** (`packages/contracts/src/automations.ts`) : `MicroSeanceParams = z.object({ hour: z.union([z.literal(19), z.literal(20), z.literal(21)]).default(20), durationMin: z.union([z.literal(3), z.literal(5), z.literal(10)]).default(5) })` ; kind `micro_session_proposed`.
- **ET-2 Définition** `packages/automations/src/definitions/micro-seance.ts` : `triggers: [{ type: 'hourly', localHour: (p) => p.hour }]`. Fonction pure `shouldProposeMicroSession({ today, studyDays, dailyActivity, slotsToday, candidates })` dans `packages/automations/src/micro-seance/should-propose.ts`.
- **ET-3 Session** : `GET /formations/:fid/global-quiz/today?mode=micro` lit `automation_settings(micro_seance).params.durationMin` pour dimensionner la session (SPEC-406 `mode: 'micro', durationMin`). Si l'automatisme est désactivé, la micro-séance manuelle de SPEC-703 garde sa durée par défaut de 5 min.
- **ET-4 Consommation** : crochet dans `packages/services/src/review/complete-session.ts` (SPEC-701/703) : après commit, `consumeAutomationActions(userId, { automation: 'micro_seance', date })`.
- **ET-5 API** : aucune route nouvelle ; paramètre de page `mode=micro` sur la route d'écran `/formations/[fid]/quiz-global` (déjà prévu par la route d'API `?mode=full|micro`).
- **ET-6 Performances** : la condition (3) appelle le tirage en mode lecture seule, sans créer d'activité ; < 100 ms par utilisateur.

## 7. Comportements attendus et cas limites

- **CL-1 Automatisme désactivé** : rien n'est proposé ; la micro-séance reste disponible manuellement (SPEC-703).
- **CL-2 Heures calmes** : avec `hour = 21` et heures calmes dès 21:00, l'in-app est créée, l'e-mail et le push sont reportés à 08:00 puis supprimés car expirés (sans objet).
- **CL-3 Plafond de notifications atteint** : l'in-app et le créneau existent ; envoi hors application `capped`.
- **CL-4 Pause globale active** : aucun déclenchement ; les jours de pause sont neutres pour la série.
- **CL-5 Activité faite à 19:59** : au tick de 20 h, la condition (2) est fausse : rien.
- **CL-6 Double déclenchement** : `dedupeKey` journalier → une seule action par jour.
- **CL-7 Annulation après consommation** : refusée (422) ; le journal n'affiche pas « Annuler ».
- **CL-8 Fuseau et changement d'heure** : l'heure locale fait foi ; le 25 octobre (jour de 25 h), un seul déclenchement grâce à la clé journalière.
- **CL-9 Jour non prévu (week-end)** : pas de proposition ; la série n'est pas en jeu (jour neutre).
- **CL-10 Aucune notion à réviser** : condition (3) fausse, rien n'est proposé (pas de session vide).
- **CL-11 Faite après minuit** : l'action est déjà `expired` ; la session compte pour le nouveau jour.

## 8. Instructions d'implémentation

1. Schéma et kind dans `packages/contracts/src/automations.ts` ; tests. Commit `feat(SPEC-713): paramètres de la micro-séance de secours`.
2. `should-propose.ts` (fonction pure) et tests unitaires.
3. `definitions/micro-seance.ts` : `run`, `apply` (créneau), `explain` (EF-8), `undo` (EF-9) ; enregistrement dans le registre. Commit `feat(SPEC-713): définition de l'automatisme micro-séance`.
4. Crochet de consommation dans le service de complétion de session et dans le service d'activité quotidienne (SPEC-411) pour toute activité qualifiante du jour.
5. Écran quiz global : lecture de `?mode=micro`, libellé de durée dynamique. Commit `feat(SPEC-713): lien profond vers la micro-séance`.
6. Page de démonstration `apps/web/app/_dev/sdd/SPEC-713/page.tsx` non requise (écran SCR-10 existant) : le test e2e utilise l'écran réel et le panneau de notifications.
7. Tests (section 12). Commit `test(SPEC-713): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/automations/src/definitions/micro-seance.ts`, `packages/automations/src/micro-seance/should-propose.ts` (+ tests), `packages/automations/test/integration/micro-seance.test.ts`, `apps/web/e2e/specs/automations/micro-seance.spec.ts`.
- **Modifiés** : `packages/contracts/src/automations.ts`, `packages/automations/src/registry.ts`, `packages/services/src/review/complete-session.ts`, `packages/services/src/learning/daily-activity.ts`, `apps/web/app/(app)/formations/[fid]/quiz-global/page.tsx` (mode initial), `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : composants du quiz global (SPEC-701/703), `@learny/ui` SegmentedControl.

## 10. Interface et conformité visuelle

- Mode `tokens` (aucun nouvel écran) : SCR-10 en mode micro et panneau de notifications (SPEC-306).
- Structure vérifiée : sur `/formations/<fid>/quiz-global?mode=micro`, groupe « Durée de la séance » avec deux boutons « Séance complète · 10 min » (`aria-pressed="false"`) et « Micro-séance · 5 min » (`aria-pressed="true"`, `data-testid="global-quiz-mode-micro"`), note de mode (`data-testid="global-quiz-mode-note"`) au texte d'EF-5, rail limité aux jeux de la micro-séance ; dans le panneau des notifications, l'entrée `data-testid="notification-item"` « Micro-séance de secours ».
- Jetons : bouton actif fond `#111113` texte `#FFFFFF`, inactif texte `#62626B` ; pastille de type de notification « révision » fond `#EEF8CF` couleur `#3F5A00` (comme « Quiz global du jour » de la maquette).
- Ligne de base `toHaveScreenshot('quiz-global-micro.png', { maxDiffPixelRatio: 0.01 })`, horloge figée 2026-11-11T12:20:00Z, seed SPEC-115.

## 11. Critères d'acceptation

- **CA-1** Au tick de 20 h d'un jour d'étude sans activité, une action `micro_session_proposed` `applied`, un créneau `micro_session` de 5 min à 20:00 et une notification au texte d'EF-4 sont créés.
- **CA-2** Si une activité qualifiante a eu lieu dans la journée, ou si le jour n'est pas prévu, ou si l'automatisme est désactivé, ou en pause globale, rien n'est créé.
- **CA-3** Le lien de la notification ouvre le quiz global en mode micro avec le mode sélectionné et la durée réglée (3, 5 ou 10 min).
- **CA-4** Terminer la micro-séance passe l'action `consumed`, le créneau `done`, le jour `qualifying = true` et la série n'est pas interrompue.
- **CA-5** Non faite à minuit, l'action est `expired` et le créneau `missed` ; l'annulation avant consommation retire le créneau.
- **CA-6** Un tick rejoué le même jour ne crée aucun doublon ; une notification hors application en heures calmes est supprimée après expiration.
- **CA-7** Les textes d'explication respectent les deux tons et les quatre statuts.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-713] micro-séance …')`) : `should-propose.test.ts` (tableau des conditions EF-2, CL-5, CL-9, CL-10) ; `definitions/micro-seance.test.ts` (`explain` × statuts × tons, CA-7).
- **Intégration** (`[SPEC-713]`, base réelle, horloge avancée à 19:00, 20:05, 23:59, 00:05 locale, ticks exécutés directement) dans `packages/automations/test/integration/micro-seance.test.ts` : déclenchement (CA-1) ; non-déclenchements (CA-2) ; complétion de session micro → consommation et série (CA-4) ; expiration et undo (CA-5) ; double tick et heures calmes avec `hour = 21` (CA-6) ; plafond atteint → livraison `capped`.
- **End-to-end** (`apps/web/e2e/specs/automations/micro-seance.spec.ts`, vidéo) : `test('micro-séance proposée puis faite @SPEC-713', …)` : seed + suppression de l'activité du jour par fabrique, horloge serveur à 2026-11-11T19:05:00Z (20:05 Paris) et exécution du tick par l'utilitaire de test, ouvrir la cloche, cliquer « Micro-séance de secours », vérifier le mode micro (CA-3), jouer la session jusqu'à « Session terminée », revenir à l'accueil et vérifier l'entrée « Micro-séance » de la carte « Le tuteur a agi pour vous » (texte consommé) (CA-4). Axe sur le quiz global.
- **Visuel** (`test('quiz global en mode micro, jetons et structure @SPEC-713 @visual', …)`) : `expectTokens`, structure de la section 10, ligne de base.
- **Non-régression** : `@SPEC-701`, `@SPEC-703`, `@SPEC-711`, `pnpm test:int -t SPEC-409`.

| Critère | Tests |
|---|---|
| CA-1 | intégration « déclenchement » |
| CA-2 | intégration « non-déclenchements » ; unitaire `should-propose` |
| CA-3 | e2e ; visuel |
| CA-4 | intégration « complétion » ; e2e |
| CA-5 | intégration « expiration et undo » |
| CA-6 | intégration « double tick et heures calmes » |
| CA-7 | unitaire `explain` |

## 13. Preuves attendues

`evidence/SPEC-713/` : vidéo `video/micro-seance.webm`, captures `screenshots/notification-micro.png`, `screenshots/quiz-global-micro.png`, `screenshots/accueil-micro-faite.png`, contrôle des jetons dans `checks.json`, rapports et `acceptance.md`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; de plus : consommation démontrée par test d'intégration, aucune notification hors application envoyée en heures calmes, aucune route nouvelle.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0031, ADR-0033, ADR-0047, ADR-0067, ADR-0190 (contrat), ADR-0192 (§1 : une micro-séance n'est jamais replacée).
- Décisions : notification de type `global_quiz_today` (préférence « Révisions et quiz global ») car la micro-séance est une révision ; formation retenue selon EF-2 ; durée D transmise au tirage micro ; l'action est consommée par toute activité qualifiante du jour (la série est sauvée, l'objectif est atteint).
- Hypothèses : SPEC-703 expose un paramètre `durationMin` du mode micro ; sinon SPEC-713 l'ajoute avec la valeur par défaut 5. Aucune route ni colonne nouvelle.
