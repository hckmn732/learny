---
id: SPEC-712
title: "Automatisme 1 : reprise après décrochage"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-407]
business_rules: [BR-AUT-01, BR-AUT-13]
screens: [SCR-03]
adrs: [ADR-0190, ADR-0191, ADR-0192]
visual: mockup
---

# SPEC-712 — Automatisme 1 : reprise après décrochage

## 1. Objectif

Livrer l'automatisme `reprise` : détection des séances manquées et de l'inactivité, replacement automatique ou proposé d'une séance manquée, proposition d'une reprise de 5 minutes après N jours sans activité, proposition d'alléger le programme ou de décaler la fin après M jours, et le bandeau d'accueil « Le tuteur propose · votre accord est demandé » (accepter, autre créneau, annuler) conforme à `Main.dc.html`.

## 2. Contexte

Premier automatisme « Contre le décrochage » (BR-SET-04, groupe 1). Il s'exécute sur le moteur `@learny/automations` (SPEC-711) selon le contrat ADR-0190, utilise le planificateur (SPEC-407) pour trouver les créneaux, et s'affiche sur l'accueil (SCR-03, SPEC-603) au-dessus de « Votre journée ».

À lire : `docs/product/business-rules.md` (BR-AUT-01, BR-AUT-11, BR-AUT-13, BR-AGE-03/04, BR-FOR-14, BR-NOT-02/05/06, BR-ACC-05), `docs/architecture/data-model.md` §1 (`automation_settings`, `pauses`), §7 (`schedule_slots`, `automation_actions`, `daily_activity`), `docs/architecture/api.md` (automatismes, agenda), `docs/architecture/overview.md` §5 (crons), `design/maquettes/Main.dc.html` (section `aria-labelledby="t-propose"` et script `renderVals`, partie « 1. Reprise après décrochage »), `design/maquettes/Parametres.dc.html` (automatisme `reprise`, journal), ADR-0016, ADR-0029, ADR-0030, ADR-0031, ADR-0033, ADR-0067, ADR-0190, ADR-0191, ADR-0192.

## 3. Dépendances

- **SPEC-711** (`done`) : `defineAutomation`, registre, `automation_settings`, `automation_actions`, routes `/me/automations` et `/me/automation-actions/:id/(accept|decline|undo)`, expiration, `markConsumed`, garde-fous (heures calmes, plafond via SPEC-209, pause globale).
- **SPEC-407** (`done`) : `packages/learning-engine/src/planner` — fonctions `findCompatibleSlots(input, { durationMin, from, count, formationId })` (créneaux libres compatibles avec les jours, moments et la capacité quotidienne cumulée) et `computeReplanOptions(formation, state)` (options BR-FOR-14) ; persistance par `packages/services/learning` (SPEC-411).
- Utilisés sans être déclarés au catalogue (phase P6 terminée ou spécification P7 antérieure dans l'ordre du catalogue) : SPEC-603 (page `/accueil`, `GET /home`), SPEC-705 (dialogue `ReplanOptionsDialog` et `POST /formations/:fid/replan`), SPEC-209 (`notify`), SPEC-207 (`userLocalHour`, `startOfUserDay`), SPEC-115 (jeu de démonstration).
- Aucune dépendance externe. IA non utilisée (BR-IA-09 : tout est calculé par le code).

## 4. Règles métier couvertes

- **BR-AUT-01** : implémentée par la définition `reprise` : séance manquée → replacement dans la prochaine marge (ADR-0192) en mode `auto`, proposition en mode `accord` (défaut) ; `inactiveDays` (défaut 2 ; 1/2/3) → reprise de 5 min proposée ; `lightenDays` (défaut 5 ; 4/5/7) → proposition d'alléger ou décaler, toujours sur accord (BR-AUT-11).
- **BR-AUT-13** : implémentée par le composant `TutorProposalBanner` de l'accueil (actions en attente : Accepter, Autre créneau, refus « Ne pas replacer », Annuler après décision) selon ADR-0191.

## 5. Exigences fonctionnelles

- **EF-1 Paramètres** (`RepriseParams`) : `inactiveDays ∈ {1,2,3}` défaut 2 ; `lightenDays ∈ {4,5,7}` défaut 5, toujours `> inactiveDays` ; `mode ∈ {'auto','accord'}` défaut `'accord'`. Libellés (repris par SPEC-710) : « Proposer une reprise après », « Proposer d'alléger après », « Replacer les séances manquées » (« Automatiquement » / « Après mon accord »).
- **EF-2 Séance manquée** : au tick horaire de 22 h locale, chaque créneau manqué au sens d'ADR-0192 §1 passe `missed` et produit un brouillon. Mode `auto` → `kind = 'slot_rescheduled'`, sans accord, appliqué aussitôt. Mode `accord` → `kind = 'reprise_proposed'`, `requiresConsent = true`, `expiresAt` = début du créneau proposé.
- **EF-3 Emplacement** : calculé selon ADR-0192 §4 ; `payload = { dedupeKey: 'missed:<slotId>', missedSlotId, title, missedDate, proposed: { startsAt, endsAt, bufferSlotId|null, inBuffer: boolean }, alternatives: [{ startsAt, endsAt }] (3 au plus) }`. Aucun emplacement trouvé dans les 7 jours → aucun brouillon de replacement ; un brouillon `plan_change_proposed` est produit à la place (EF-6) avec `reason: 'no_room'`.
- **EF-4 Application d'un replacement** (`apply`) : crée un créneau `schedule_slots` de même `kind`, `title`, `formation_id`, `module_id`, `activity_id`, `created_by = 'automation'`, `moved_from_id = missedSlotId`, aux heures choisies (`payload.choice.startsAt` si fourni et présent dans `alternatives`, sinon `proposed`) ; met le créneau manqué au statut `moved` ; raccourcit ou annule la marge utilisée. `undoPayload = { createdSlotId, bufferSlotId, bufferBefore: { startsAt, endsAt, status } }`.
- **EF-5 Reprise de 5 minutes** : au tick de 08 h locale, si les jours sans activité (ADR-0192 §2) ≥ `inactiveDays` et < `lightenDays`, brouillon unique par épisode `kind = 'reprise_short_proposed'`, `formationId = profiles.current_formation_id`, `requiresConsent = true`, `payload = { dedupeKey: 'short:<dernièreActivité>', inactiveDays, proposed, alternatives }` où `proposed` est le premier créneau compatible de 5 minutes du jour (sinon du lendemain) et `expiresAt` = fin du jour local de `proposed`. `apply` crée un créneau `micro_session` de 5 minutes (titre « Reprise en douceur ») lié à la micro-séance de la formation (`GET /formations/:fid/global-quiz/today?mode=micro`). Notification `relaunch` (préférence `type_relaunch`), titre « Reprenons en douceur », texte « 5 minutes suffisent aujourd'hui : quelques cartes de rappel et une question. » (variante tu : « 5 minutes suffisent aujourd'hui : quelques cartes de rappel et une question, à toi de jouer. »), lien `/accueil`.
- **EF-6 Alléger ou décaler** : au tick de 08 h, si les jours sans activité ≥ `lightenDays`, un brouillon par formation active non terminée : `kind = 'plan_change_proposed'`, `requiresConsent = true`, `payload = { dedupeKey: 'plan:<formationId>:<dernièreActivité>', reason: 'inactivity'|'no_room', inactiveDays, options: computeReplanOptions(...) restreintes à 'shift_end' et 'lighten' }`, `expiresAt` = +7 jours. Aucun effet n'est appliqué tant que l'apprenant n'a pas choisi une option dans le dialogue de SPEC-705 ; le choix appelle `POST /me/automation-actions/:id/accept` avec `choice = { option: 'shift_end'|'lighten' }`, dont `apply` délègue au service de replanification de SPEC-705. Notification `planning_adjusted`, titre « Votre planning à revoir », texte = `summary`, lien `/accueil`.
- **EF-7 Notifications de replacement** : `slot_rescheduled` et `reprise_proposed` notifient `session_to_reschedule` (préférence `type_planning`), titre « Une séance à replacer », texte = `summary` + (pour une proposition) « Votre accord est demandé. » / « Ton accord est demandé. », lien `/accueil`, `dedupeKey` = celui de l'action.
- **EF-8 Explications** (`explain`, une ligne ; jour = nom du jour en minuscules si dans les 6 jours, sinon « lundi 16 nov. » ; heure `H:mm`) :
  - `reprise_proposed`, statut `pending_consent` : « « {titre} » n'a pas été terminé {jourManqué}. Je propose de le reprendre {jour} à {heure}, dans une marge de votre agenda. » (tu : « … dans une marge de ton agenda. ») ; si `inBuffer = false` : « dans un créneau libre de votre agenda ».
  - `reprise_proposed` appliquée / `slot_rescheduled` : « C'est noté : reprise de « {titre} » {jour} {heure}. Elle est dans votre agenda. » (tu : « … dans ton agenda. ») — journal : « « {titre} » non terminé : reprise placée {jour} {heure}, dans une marge. ».
  - `reprise_short_proposed` : « Vous n'avez pas étudié depuis {n} jours. Je propose une reprise de 5 minutes {jour} à {heure}. » (tu : « Tu n'as pas étudié depuis {n} jours. Je te propose une reprise de 5 minutes {jour} à {heure}. »).
  - `plan_change_proposed` : « {n} jours sans étude sur « {formation} » : je propose d'alléger le programme ou de décaler la fin. » ; `reason = 'no_room'` : « Plus de place pour reprendre « {titre} » cette semaine : je propose d'alléger le programme ou de décaler la fin. ».
  - Statut `declined` : préfixe « Refusé : » ; `expired` : préfixe « Expiré : » ; `undone` : préfixe « Annulé : ».
- **EF-9 Bandeau d'accueil** (`TutorProposalBanner`, ADR-0191) : affiché si au moins une action `pending_consent` de `reprise` existe ou si une action vient d'être acceptée dans la page ; sinon absent du DOM. Sur-titre « Le tuteur propose · votre accord est demandé » (proposition) ou « Séance replacée » (après accord) ; texte = `summary`.
  - Proposition de créneau : boutons « Accepter » (noir) et « Autre créneau » (`aria-expanded`). « Autre créneau » déplie un groupe `role="group"` « Créneaux libres proposés par le tuteur » : une pastille par alternative (« Jeudi 15:00 », « Vendredi 15:00 », « Lundi 16 nov., 9:00 ») puis « Ne pas replacer ». Choisir une pastille = accord avec `choice` ; « Ne pas replacer » = refus.
  - Après accord : sur-titre « Séance replacée », texte de confirmation, bouton « Annuler » → `undo` puis la définition propose aussitôt une nouvelle action identique (`dedupeKey` suffixé `#n`) et le bandeau revient à l'état proposition (comportement de la maquette).
  - `plan_change_proposed` : boutons « Voir les options » et « Pas maintenant ».
  - Plusieurs propositions : la plus ancienne est affichée ; lien « {n} autre(s) proposition(s) » vers `/parametres#automatismes`.
  - Mise à jour optimiste puis invalidation des clés TanStack `['automation-actions']`, `['home']`, `['agenda']` (ADR-0063) ; erreur → toast « L'action n'a pas pu être enregistrée. Réessayez. » et retour à l'état précédent.
- **EF-10 Consommation** : un créneau créé par l'automatisme et passé `done` déclenche `markConsumed` ; l'annulation n'est alors plus proposée (journal sans bouton « Annuler »).

## 6. Exigences techniques

- **ET-1 Schéma** (`packages/contracts/src/automations.ts`) :
  ```ts
  export const RepriseParams = z.object({
    inactiveDays: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
    lightenDays: z.union([z.literal(4), z.literal(5), z.literal(7)]).default(5),
    mode: z.enum(['auto', 'accord']).default('accord'),
  }).refine((p) => p.lightenDays > p.inactiveDays);
  export const RepriseChoice = z.union([
    z.object({ startsAt: z.string().datetime({ offset: true }) }),
    z.object({ option: z.enum(['shift_end', 'lighten']) }),
  ]);
  ```
  Kinds ajoutés à `AUTOMATION_ACTION_KINDS` : `slot_rescheduled`, `reprise_proposed`, `reprise_short_proposed`, `plan_change_proposed`.
- **ET-2 Définition** `packages/automations/src/definitions/reprise.ts` : `triggers: [{ type: 'hourly', localHour: 22 }, { type: 'hourly', localHour: 8 }]` ; `run` dispatche selon l'heure : 22 h → séances manquées, 8 h → inactivité. Fonctions pures dans `packages/automations/src/reprise/` : `detectMissedSlots(slots, nowLocal)`, `countInactiveStudyDays({ dailyActivity, studyDays, pauses, accountCreatedOn, today })`, `pickReplacement({ buffers, freeSlots, durationMin, now })`.
- **ET-3 Transaction d'`apply`** : verrou `SELECT … FOR UPDATE` sur le créneau manqué et la marge ; si le créneau proposé n'est plus libre (conflit d'agenda vérifié par `findCompatibleSlots`), erreur `CONFLICT` (409) et le bandeau affiche « Ce créneau n'est plus libre. Choisissez-en un autre. » en dépliant les alternatives recalculées (`run` relancé en mode `direct`).
- **ET-4 API** : aucune nouvelle route. Utilisation de `GET /api/v1/me/automation-actions?automation=reprise&status=pending_consent&limit=10` et des routes d'accord/refus/annulation de SPEC-711 ; corps d'accord `{ choice?: RepriseChoice }` (ADR-0190 §3). Erreurs : 404 `NOT_FOUND`, 409 `CONFLICT`, 422 `AUTOMATION_ACTION_CONSUMED`, 422 `AUTOMATION_ACTION_EXPIRED`.
- **ET-5 Événements** : consomme le tick horaire ; émet (via le moteur) `automation/action-proposed|-applied|-undone` ; `apply` émet `schedule/slot-created` uniquement si cet événement existe déjà (sinon rien).
- **ET-6 Accessibilité** : bandeau `section` `aria-labelledby="t-propose"`, texte en `aria-live="polite"`, focus déplacé sur le premier bouton du groupe déplié, retour au bouton « Autre créneau » à la fermeture par Échap, cibles ≥ 44 px (pastilles 38 px de haut + marge d'atteinte ≥ 44 px par `padding` du groupe).
- **ET-7 Performances** : `run` pour un utilisateur < 50 ms (hors I/O) ; le tick traite les utilisateurs par lots de 200.

## 7. Comportements attendus et cas limites

- **CL-1 Automatisme désactivé** (`enabled = false`) : aucune action produite ; les créneaux manqués passent quand même `missed` (règle d'agenda) ; le bandeau n'affiche plus les propositions existantes qui expirent normalement.
- **CL-2 Heures calmes** : la détection de 22 h produit l'action ; la notification e-mail/navigateur est reportée à la fin des heures calmes (08:00 par défaut, envoi au tick de 08:05) ; l'in-app est créée immédiatement.
- **CL-3 Plafond de notifications atteint** : l'action est créée et visible sur l'accueil ; la notification hors application est `capped` et résumée dans le programme du jour (SPEC-209).
- **CL-4 Pause globale en cours** : aucune action ; les jours de pause sont neutres pour le décompte ; au retour, l'épisode d'inactivité repart de la fin de pause.
- **CL-5 Formation en pause (ADR-0016)** : ses créneaux sont `cancelled`, donc jamais « manqués » ; elle est exclue d'EF-6.
- **CL-6 Double déclenchement** (tick rejoué, deux instances) : l'index d'idempotence sur `dedupeKey` empêche une seconde action ; la seconde exécution est un no-op.
- **CL-7 Accord après expiration** : 422 `AUTOMATION_ACTION_EXPIRED`, le bandeau disparaît et un toast « Cette proposition a expiré. » s'affiche.
- **CL-8 Annulation après consommation** : séance replacée déjà faite → 422 `AUTOMATION_ACTION_CONSUMED`, bouton « Annuler » absent.
- **CL-9 Fuseau** : un utilisateur `America/Montreal` est traité au tick où son heure locale vaut 22 h ; changement d'heure (29 mars / 25 oct.) : l'heure locale fait foi (`userLocalHour`).
- **CL-10 Mode passé de `accord` à `auto`** : les propositions en attente restent en attente ; seuls les nouveaux cas sont appliqués automatiquement.
- **CL-11 Créneau proposé pris entre-temps** : 409 et alternatives recalculées (ET-3).
- **CL-12 Aucune activité de toute la vie du compte** : décompte borné au jour de création ; un compte créé hier ne déclenche rien.
- **CL-13 Double clic sur « Accepter »** : bouton désactivé pendant la requête ; la seconde requête renvoie l'état déjà appliqué (idempotence du moteur).

## 8. Instructions d'implémentation

1. Ajouter `RepriseParams`, `RepriseChoice` et les quatre kinds dans `packages/contracts/src/automations.ts` ; tests de schéma. Commit `feat(SPEC-712): schémas de l'automatisme reprise`.
2. Écrire les fonctions pures `detectMissedSlots`, `countInactiveStudyDays`, `pickReplacement`, `formatSlotLabel(date, now, tz)` (« Jeudi 15:00 » si < 7 jours, sinon « Lundi 16 nov., 9:00 ») dans `packages/automations/src/reprise/` avec leurs tests unitaires (dont changement d'heure et pauses).
3. Écrire `definitions/reprise.ts` : `run` (deux branches), `apply` (EF-4, EF-5, délégation EF-6), `explain` (EF-8, deux tons, quatre statuts), `undo` (supprime le créneau créé : statut `cancelled`, restaure la marge depuis `undoPayload`, remet le créneau manqué `missed`) ; enregistrer dans le registre. Commit `feat(SPEC-712): définition de l'automatisme reprise`.
4. Après `undo` d'une action acceptée depuis le bandeau, appeler `run` en mode `direct` pour reproposer (dedupeKey suffixé `#n`, n = nombre d'annulations + 1).
5. Brancher `markConsumed` dans le service qui passe un créneau `done` (SPEC-411) : si `moved_from_id` non nul et `created_by = 'automation'`, consommer l'action correspondante.
6. Créer `apps/web/components/home/TutorProposalBanner.tsx` (client) et son hook `useTutorProposals()` ; l'insérer dans `apps/web/app/(app)/accueil/page.tsx` entre l'en-tête de page et la rangée « Votre journée ». Ajouter les textes à `apps/web/messages/fr.ts` (`home.proposal.*`). Commit `feat(SPEC-712): bandeau Le tuteur propose`.
7. Vérifier que le jeu de démonstration SPEC-115 contient l'action `reprise_proposed` de la maquette (créneau manqué « Ledgers parallèles » du mardi 10 nov., proposé jeudi 12 nov. 10:30, alternatives jeudi 15:00, vendredi 15:00, lundi 16 nov. 9:00) ; à défaut, la compléter dans le module d'automatismes du seed.
8. Page de contrôle : aucune page `/_dev/sdd` (écran maquetté).
9. Tests unitaires, d'intégration, e2e et visuels (section 12). Commit `test(SPEC-712): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/automations/src/definitions/reprise.ts`, `packages/automations/src/reprise/{detect-missed.ts,inactivity.ts,pick-replacement.ts,labels.ts}` et leurs `*.test.ts`, `packages/automations/test/integration/reprise.test.ts`, `apps/web/components/home/TutorProposalBanner.tsx`, `apps/web/components/home/use-tutor-proposals.ts`, `apps/web/e2e/specs/automations/reprise.spec.ts`.
- **Modifiés** : `packages/contracts/src/automations.ts` (schémas, kinds), `packages/automations/src/registry.ts` (enregistrement), `packages/services/src/learning/slots.ts` (consommation), `apps/web/app/(app)/accueil/page.tsx` (insertion du bandeau), `apps/web/messages/fr.ts`, seed de démonstration si nécessaire (étape 7).
- **Lus / réutilisés** : `@learny/ui` (Button, Chip, Toast), `packages/learning-engine/src/planner`, `packages/core/src/time.ts`, `ReplanOptionsDialog` (SPEC-705).

## 10. Interface et conformité visuelle

- Écran SCR-03, maquette `design/maquettes/Main.dc.html`, état par défaut (proposition en attente), référence `design/references/SCR-03-desktop.png`.
- Structure (ordre dans la page) : en-tête de page (« Mercredi 11 novembre », « Votre journée d'apprentissage », « Nouvelle formation ») → bandeau `data-testid="tutor-proposal-banner"` → rangée « Votre journée ».
- Bandeau : fond `#FFFFFF`, bordure `#E7E6E1`, bordure gauche 6 px `#F97316`, rayon 20 px ; pictogramme 38 px fond `#FFEDE0` couleur `#8F3305` ; sur-titre 12 px gras majuscules `#8F3305` (`data-testid="tutor-proposal-kicker"`) ; texte 15 px (`data-testid="tutor-proposal-text"`) ; boutons « Accepter » (`tutor-proposal-accept`, fond `#111113`, texte blanc, rayon 12 px, hauteur 42 px), « Autre créneau » (`tutor-proposal-other`, bordure `#DAD9D3`), groupe des créneaux (`tutor-proposal-slots`, pastilles `tutor-proposal-slot-<i>` fond `#F8F8F6` rayon 999 px, `tutor-proposal-decline` « Ne pas replacer »), « Annuler » (`tutor-proposal-undo`), « Voir les options » (`tutor-proposal-options`), « Pas maintenant » (`tutor-proposal-later`), lien « autres propositions » (`tutor-proposal-more`).
- Textes exacts à l'état par défaut (seed, horloge 2026-11-11T12:20:00Z) : sur-titre « Le tuteur propose · votre accord est demandé » ; texte « « Ledgers parallèles » n'a pas été terminé mardi. Je propose de le reprendre jeudi à 10:30, dans une marge de votre agenda. » ; pastilles « Jeudi 15:00 », « Vendredi 15:00 », « Lundi 16 nov., 9:00 », « Ne pas replacer ».
- États : chargement → bandeau absent (pas de squelette pour ne pas décaler la page) ; erreur de chargement → absent et erreur journalisée ; aucune proposition → absent.
- Responsive : sous 640 px, boutons sur une ligne entière ; groupe des créneaux sans retrait gauche.
- Contrôles automatisés : (1) jetons via `expectTokens` sur bandeau, sur-titre, boutons ; (2) structure et textes ci-dessus ; (3) comparaison avec `design/references/SCR-03-desktop.png` (seed SPEC-115, horloge figée 2026-11-11T12:20:00Z, 1440×900) ≤ 12 % de pixels différents, image côte à côte dans `evidence/SPEC-712/visual/` ; (4) ligne de base `toHaveScreenshot('accueil-bandeau.png', { maxDiffPixelRatio: 0.01 })` (mise à jour de la ligne de base de l'accueil de SPEC-603, justifiée dans le rapport).

## 11. Critères d'acceptation

- **CA-1** En mode `accord`, un créneau de cours non fait d'une formation active est marqué `missed` au tick de 22 h locale et une action `reprise_proposed` est créée avec l'emplacement d'ADR-0192 et 3 alternatives.
- **CA-2** En mode `auto`, la même situation crée un créneau `created_by = 'automation'` dans la première marge, la marge est raccourcie, et l'action est `applied` avec le texte « C'est noté : reprise de … ».
- **CA-3** Après 2 jours d'étude prévus sans activité qualifiante, une seule action `reprise_short_proposed` est créée au tick de 08 h, avec une notification `relaunch` ; un second tick le même jour n'en crée pas d'autre.
- **CA-4** Après 5 jours, une action `plan_change_proposed` par formation active est en attente et **aucun** changement de planning n'est appliqué sans choix explicite.
- **CA-5** Sur l'accueil (seed), le bandeau affiche exactement les textes de la maquette ; « Autre créneau » déplie 3 pastilles + « Ne pas replacer » ; choisir « Vendredi 15:00 » crée le créneau vendredi 15:00 et affiche « Séance replacée ».
- **CA-6** « Annuler » après accord retire le créneau (statut `cancelled`), remet la marge, passe l'action `undone` et réaffiche la proposition.
- **CA-7** Désactivé, en pause globale, ou en double déclenchement, aucune action n'est créée ; une action consommée n'est plus annulable (422).
- **CA-8** Les deux tons produisent les textes d'EF-8 ; la capture de l'accueil respecte le seuil de 12 % et axe ne signale aucune violation serious/critical.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-712] reprise …')`) :
  - `packages/automations/src/reprise/inactivity.test.ts` : jours neutres (week-end, pause), compte créé récemment, changement d'heure → valeurs attendues tabulées.
  - `detect-missed.test.ts` : types exclus (`global_quiz`, `buffer`…), créneau terminé à 21:59 vs 22:01.
  - `pick-replacement.test.ts` : marge disponible, marge plus courte, aucune marge (repli planificateur), alternatives sur deux jours.
  - `labels.test.ts` : « Jeudi 15:00 », « Lundi 16 nov., 9:00 ».
  - `definitions/reprise.test.ts` : `explain` pour chaque kind × statut × ton (CA-8).
  - `apps/web/components/home/TutorProposalBanner.test.tsx` : états proposition / dépliée / acceptée / grand changement, focus et Échap.
- **Intégration** (`[SPEC-712]`, base réelle, horloge avancée pas à pas, tick exécuté directement par `runAutomation('reprise', userId, { type: 'hourly', localHour })`) dans `packages/automations/test/integration/reprise.test.ts` :
  - accord : créneau manqué → action `pending_consent` (CA-1) ; accord avec `choice` hors alternatives → 422 `VALIDATION_FAILED`.
  - auto : créneau créé, marge raccourcie (CA-2) ; undo → marge restaurée (CA-6).
  - inactivité J+2 à 08 h → `reprise_short_proposed` + notification ; tick rejoué → aucun doublon (CA-3).
  - inactivité J+5 → `plan_change_proposed` × formations actives, aucun créneau modifié (CA-4).
  - désactivé, pause globale active, formation en pause, double appel concurrent (`Promise.all`) → aucune action supplémentaire ; créneau replacé passé `done` → undo 422 `AUTOMATION_ACTION_CONSUMED` (CA-7) ; heures calmes → livraison `deferred_quiet` ; plafond → `capped`.
  - utilisateur `America/Montreal` : traité au bon tick UTC.
- **End-to-end** (`apps/web/e2e/specs/automations/reprise.spec.ts`, seed SPEC-115, horloge figée, vidéo) :
  - `test('bandeau de reprise : autre créneau puis annuler @SPEC-712', …)` : ouvrir `/accueil`, vérifier textes, cliquer « Autre créneau », choisir « Vendredi 15:00 », vérifier « Séance replacée », ouvrir `/agenda?vue=semaine&date=2026-11-13` et voir le créneau, revenir, « Annuler », vérifier le retour à la proposition (CA-5, CA-6).
  - `test('refus : ne pas replacer @SPEC-712', …)` : déplier, « Ne pas replacer », bandeau absent, journal `/parametres#automatismes` montre « Refusé : … ».
  - axe sur `/accueil` (aucune violation serious/critical).
- **Visuel** (`test('accueil avec bandeau conforme à la maquette @SPEC-712 @visual', …)`) : jetons, structure, comparaison ≤ 12 % avec `design/references/SCR-03-desktop.png`, ligne de base `toHaveScreenshot` (CA-8).
- **Non-régression** : rejouer `@SPEC-603`, `@SPEC-711`, `@SPEC-704`, `@SPEC-705` et `pnpm test:int -t SPEC-407`.

| Critère | Tests |
|---|---|
| CA-1 | intégration « accord » ; unitaire `detect-missed`, `pick-replacement` |
| CA-2 | intégration « auto » |
| CA-3 | intégration « inactivité J+2 » ; unitaire `inactivity` |
| CA-4 | intégration « inactivité J+5 » |
| CA-5 | e2e « bandeau de reprise » ; unitaire `TutorProposalBanner` |
| CA-6 | e2e « bandeau de reprise » ; intégration « undo » |
| CA-7 | intégration cas limites |
| CA-8 | unitaire `explain` ; visuel `@visual` ; axe |

## 13. Preuves attendues

`evidence/SPEC-712/` : vidéo `video/reprise-autre-creneau.webm` et `video/reprise-refus.webm`, captures `screenshots/accueil-bandeau-defaut.png`, `screenshots/accueil-bandeau-deplie.png`, `screenshots/accueil-bandeau-replace.png`, comparaison `visual/SCR-03-bandeau-side-by-side.png` et `visual/SCR-03-bandeau-diff.png` avec le taux mesuré, rapports unitaires/intégration/e2e, `acceptance.md` complété.

## 14. Définition de terminé

Définition commune de `docs/engineering/testing.md` §7, plus : les huit critères cochés avec preuve ; aucune modification du planning sans accord en mode `accord` démontrée par test ; ligne de base de l'accueil mise à jour et justifiée ; textes ajoutés à `apps/web/messages/fr.ts` ; tableau des routes de `docs/architecture/api.md` inchangé (aucune route nouvelle).

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0016 (formations en pause exclues), ADR-0029 (planificateur), ADR-0030 et ADR-0067 (heure locale, ticks horaires), ADR-0031 (plafond), ADR-0033 (jours neutres), ADR-0034 (conformité visuelle), ADR-0047 (horloge), ADR-0063 (TanStack Query).
- Décisions de cette spécification : ADR-0190 (contrat des automatismes), ADR-0191 (variantes du bandeau, refus « Ne pas replacer », annulation qui repropose), ADR-0192 (définitions de séance manquée, jours sans activité, épisode, emplacement).
- Hypothèses : le dialogue d'options de SPEC-705 accepte une liste d'options autorisées (`allowed={['shift_end','lighten']}`) ; s'il ne l'accepte pas, SPEC-712 ajoute cette propriété sans changer son comportement par défaut. La détection à 22 h n'empêche pas le cron nocturne de marquer `missed` les créneaux restants. Aucune route ni colonne nouvelle ; l'index d'idempotence relève d'ADR-0190.
