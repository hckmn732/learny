---
id: SPEC-714
title: "Automatisme 3 : échauffement"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-410]
business_rules: [BR-AUT-03]
screens: [SCR-03]
adrs: [ADR-0190, ADR-0193]
visual: mockup
---

# SPEC-714 — Automatisme 3 : échauffement

## 1. Objectif

Livrer l'automatisme `echauffement` : chaque jour d'étude, ajouter avant la prochaine séance une activité « Échauffement » de N questions de rappel (notions vues la veille et prérequis du chapitre), jouable dans un bloc interactif de l'accueil (question, « Voir la réponse », « Je savais » / « À revoir », score, suite) ; chaque notion « À revoir » passe dans le quiz global du soir.

## 2. Contexte

Premier automatisme du groupe « Mémorisation ». La sélection des notions est livrée par SPEC-410 (moteur déterministe) ; cette spécification persiste l'activité, la place dans la journée, rend le bloc de l'accueil (SCR-03, `design/maquettes/Main.dc.html`, section `id="echauffement"`) et relie les réponses à FSRS et au quiz global.

À lire : BR-AUT-03, BR-AUT-11, BR-MEM-02, BR-MEM-03, BR-PRO-02, BR-AGE-02 ; `docs/architecture/data-model.md` §5 (`activities`, `attempts`, `answers`), §6 (`notion_states`, `review_logs`), §7 ; `design/maquettes/Main.dc.html` (ligne « 13:50 Échauffement » de « Votre journée », section `#echauffement`, script `renderVals` partie « 3. Échauffement ») ; `design/maquettes/Parametres.dc.html` (automatisme `echauffement`) ; ADR-0025, ADR-0190, ADR-0193.

## 3. Dépendances

- **SPEC-711** : moteur et contrat ADR-0190.
- **SPEC-410** : `selectWarmupNotions({ count, scope, seenYesterday, nextChapterPrerequisites, notionStates, today })` → `[{ notionId, tag: 'yesterday'|'prerequisite', moduleNumber }]`, exclut les notions jamais vues.
- Utilisés : SPEC-411 (application des réponses : `review_logs` source `warmup`, FSRS, maîtrise), SPEC-406/701 (session du quiz global du jour), SPEC-513 (banques : briques `recall_card` et `choice_question`), SPEC-603 (accueil, liste « Votre journée »).
- Aucune dépendance externe ; aucun appel IA (les questions viennent des banques déjà générées).

## 4. Règles métier couvertes

- **BR-AUT-03** : définition `echauffement` ; N questions (défaut 3 ; 2/3/5) sur les notions vues la veille et les prérequis du chapitre (liens `prerequisite` de la carte) ou la veille seulement ; boutons « Je savais » / « À revoir » ; une notion « À revoir » est ajoutée au quiz global du soir.

## 5. Exigences fonctionnelles

- **EF-1 Paramètres** (`EchauffementParams`) : `count ∈ {2,3,5}` défaut 3 ; `scope ∈ {'yesterday_prerequisites','yesterday'}` défaut `'yesterday_prerequisites'`. Libellés (SPEC-710) : « Nombre de questions » ; « Porte sur » (« La veille et les prérequis », « La veille seulement »).
- **EF-2 Séance** : une séance = un créneau planifié du jour de type `course|exercise|validation_quiz|contributions|mock_exam`. La « prochaine séance » d'une formation = le premier de ces créneaux du jour, `planned`, qui commence après l'instant courant.
- **EF-3 Génération** : au tick horaire de 06 h locale, pour chaque formation active ayant au moins une séance aujourd'hui, `run` appelle `selectWarmupNotions` ; « vues la veille » = notions ayant un `review_log` ou une réponse la veille (jour d'étude précédent si la veille n'était pas prévue) ; « prérequis du chapitre » = notions reliées par `prerequisite` aux notions du chapitre de la prochaine séance. Si moins d'une notion est disponible, rien n'est créé. Les questions sont tirées de la banque de l'apprenant : `recall_card` en priorité, sinon `choice_question` (recto = énoncé, verso = texte de la bonne option et explication) ; aucune question déjà vue la veille (empreinte).
- **EF-4 Action** : `kind = 'warmup_added'`, `requiresConsent = false`, `payload = { dedupeKey: 'warmup:<date>:<formationId>', date, activityId, slotId, notionIds, reviewNotionIds: [] }`. `apply` crée l'activité `activities.kind = 'warmup'` (`for_date` = aujourd'hui, `items` = briques) et un créneau `schedule_slots.kind = 'warmup'` commençant 10 minutes avant la prochaine séance, de durée `ceil(count × 40 s / 60)` minutes (2 min pour 2 ou 3 questions, 4 min pour 5), titre « Échauffement », `meta` « {N} questions de rappel · {d} min · ajouté par le tuteur », `created_by = 'automation'`.
- **EF-5 Suivi de la prochaine séance** : à chaque tick horaire, si le créneau d'échauffement n'est pas `done` et que sa séance a commencé, il est déplacé 10 minutes avant la séance suivante du jour (statut `moved` sur l'ancien, nouveau créneau `moved_from_id`) ; s'il n'en reste aucune, il passe `missed` et l'action `expired` en fin de journée.
- **EF-6 Ligne de « Votre journée »** (accueil) : heure, pastille `#C6F432`, titre « Échauffement », détail = `meta`, lien « Faire » vers `#echauffement`.
- **EF-7 Bloc interactif** (`WarmupCard`, section `id="echauffement"`) visible s'il existe une activité d'échauffement du jour non terminée ou terminée aujourd'hui :
  - titre « Échauffement · avant votre {séance} de {HH:mm} » avec {séance} ∈ « quiz » (`validation_quiz`), « cours », « exercice », « examen blanc », « séance d'apports » ; sous-titre « {N} questions de rappel, {d} minutes : la veille et les prérequis du chapitre. » (portée `yesterday` : « … : les notions vues la veille. ») ; compteur « Question {i} sur {N} » puis « Terminé » ;
  - segments de progression : fait-juste `#14A38B`, fait-à revoir `#F97316`, courant `#111113`, à venir `#E7E6E1` ;
  - pastille d'origine « Vu hier » (fond `#E1F4EF`, texte `#0B5C4D`) ou « Prérequis · module {n} » (fond `#ECECFC`, texte `#2E2E8F`) ; question en 20 px Space Grotesk ;
  - « Voir la réponse » → réponse affichée + « Je savais » (citron) et « À revoir » (contour) ; un choix enregistre la réponse et passe à la question suivante ;
  - fin (`role="status"`, fond `#111113`) : « Échauffement fait : {k} sur {N} » ; suite : s'il y a des notions à revoir « À revoir : « {q1} », « {q2} ». Ces notions repassent dans le quiz global de ce soir. » (singulier : « Cette notion repasse dans le quiz global de ce soir. »), sinon « Tout est là. Vous êtes prêt pour le quiz de validation. » (autres séances : « Tout est là. Vous êtes prêt pour la suite. ») ; boutons « Passer au quiz de validation » (ou « Ouvrir le cours », « Ouvrir l'exercice », « Commencer l'examen blanc », « Ouvrir le module ») et « Recommencer ».
- **EF-8 Effets des réponses** : la première passe seulement est enregistrée (tentative n° 1) : « Je savais » → `review_logs` source `warmup`, note `good` ; « À revoir » → note `again` ; FSRS et maîtrise appliqués par SPEC-411. Chaque notion « À revoir » est ajoutée à la session de quiz global du jour de sa formation si elle n'est pas commencée (élément ajouté en tête, BR-MEM-03 « lacunes en tête » préservé), sinon sa `due_at` est fixée au début du lendemain local ; `payload.reviewNotionIds` est complété. « Recommencer » rejoue les questions sans enregistrement.
- **EF-9 Consommation** : la fin de la première passe passe le créneau `done`, enregistre `daily_activity` (minutes réelles, non qualifiante seule) et appelle `markConsumed`.
- **EF-10 Explications** :
  - `applied` : « Échauffement ajouté avant votre {séance} de {HH:mm} : {N} questions sur {liste de notions}. » (tu : « avant ton {séance} … ») ; dernière action (SPEC-710) : « {quand}, {N} questions : {notion1}, {notion2}, {notion3}. » (« ce matin » si avant 12 h aujourd'hui, « cet après-midi », sinon jour) ;
  - `consumed` : « Échauffement fait : {k} sur {N}{ ; m notion(s) repasse(nt) dans le quiz global du soir}. » ;
  - `expired` : « Échauffement du {jour} non fait. » ; `undone` : « Annulé : échauffement du {jour}. ».
- **EF-11 Annulation** : avant toute réponse, `undo` archive l'activité (`archived`) et passe le créneau `cancelled` ; après la première réponse : `AUTOMATION_ACTION_CONSUMED`.

## 6. Exigences techniques

- **ET-1 Schéma** : `EchauffementParams = z.object({ count: z.union([z.literal(2), z.literal(3), z.literal(5)]).default(3), scope: z.enum(['yesterday_prerequisites', 'yesterday']).default('yesterday_prerequisites') })` ; kind `warmup_added`. DTO `WarmupDto = { activityId, formationId, nextSession: { kind, startsAt, href }, scope, items: [{ position, notionId, notionLabel, tag: 'yesterday'|'prerequisite', moduleNumber, question, answer }], answers: [{ position, knew }], status: 'todo'|'in_progress'|'done' }`.
- **ET-2 Routes nouvelles** (à ajouter au tableau de `docs/architecture/api.md` dans le même commit) :
  - `GET /api/v1/warmups/today` → `200 { items: WarmupDto[] }` (une entrée par formation, triées par heure de séance).
  - `POST /api/v1/warmups/:activityId/answers` body `{ position: int ≥ 0, knew: boolean }` → `200 WarmupDto` ; 404 `NOT_FOUND` (activité d'un autre utilisateur, RLS) ; 409 `CONFLICT` (position déjà répondue en première passe) ; 422 `VALIDATION_FAILED` (position hors bornes). Idempotente par `(activityId, position)`.
  - Le rejeu (« Recommencer ») est purement côté client.
- **ET-3 Définition** `packages/automations/src/definitions/echauffement.ts` : `triggers: [{ type: 'hourly', localHour: 6 }, { type: 'hourly', localHour: 'every' }]` (le second pour EF-5 ; si le moteur n'accepte pas `'every'`, déclarer les heures 7 à 22) ; services `packages/services/src/warmup/{get-today.ts,answer.ts}`.
- **ET-4 Transaction** : l'enregistrement d'une réponse, l'application FSRS, l'ajout à la session du soir et la mise à jour de `payload.reviewNotionIds` se font dans une transaction ; l'événement `review/answered` est émis après commit.
- **ET-5 Accessibilité** : section `aria-labelledby="t-echauffement"` ; segments `aria-hidden` + compteur textuel ; après « Voir la réponse », le focus va sur « Je savais » ; la fin est un `role="status"`.

## 7. Comportements attendus et cas limites

- **CL-1 Automatisme désactivé** : aucune génération ; un échauffement déjà généré aujourd'hui reste jouable jusqu'à minuit.
- **CL-2 Heures calmes / plafond** : aucune notification n'est émise par cet automatisme (affichage sur l'accueil seulement) ; non concerné.
- **CL-3 Pause globale active** : aucune génération ; aucun créneau.
- **CL-4 Aucune notion vue la veille ni prérequis** : rien n'est créé (pas de bloc).
- **CL-5 Banque vide pour une notion** : la notion est remplacée par la suivante de la sélection ; si moins d'une question au total, rien n'est créé.
- **CL-6 Double déclenchement** : `dedupeKey` par jour et formation.
- **CL-7 Annulation après consommation** : refusée, bouton « Annuler » absent du journal.
- **CL-8 Session du soir déjà jouée** : la notion « À revoir » est due le lendemain ; le texte de suite devient « … repasse dans le prochain quiz global. ».
- **CL-9 Fuseau** : génération à 06 h locale ; un utilisateur à `Pacific/Auckland` est traité au bon tick UTC.
- **CL-10 Formation en pause ou terminée** : exclue.
- **CL-11 Double clic sur « Je savais »** : la seconde requête renvoie 409 et l'interface garde l'état déjà enregistré.

## 8. Instructions d'implémentation

1. Schémas et DTO dans `packages/contracts/src/automations.ts` et `packages/contracts/src/warmup.ts`. Commit `feat(SPEC-714): contrats de l'échauffement`.
2. Services `get-today.ts` (assemble le DTO) et `answer.ts` (EF-8, ET-4) avec tests.
3. Définition `echauffement.ts` (`run`, `apply`, suivi EF-5, `explain`, `undo`), enregistrement. Commit `feat(SPEC-714): définition de l'automatisme échauffement`.
4. Routes `apps/web/app/api/v1/warmups/today/route.ts` et `apps/web/app/api/v1/warmups/[activityId]/answers/route.ts` via `handler()` ; ajout au tableau de `docs/architecture/api.md`.
5. Composant `apps/web/components/home/WarmupCard.tsx` et ligne « Échauffement » de « Votre journée » ; insertion dans `apps/web/app/(app)/accueil/page.tsx` dans la rangée sous « Votre journée » (colonne gauche, flex 3), à gauche de la colonne « Le tuteur a agi pour vous » / « Bilan de la semaine ». Textes dans `apps/web/messages/fr.ts`. Commit `feat(SPEC-714): bloc d'échauffement de l'accueil`.
6. Seed : vérifier que SPEC-115 contient l'échauffement de la maquette (3 questions : « Quelle clé de comptabilisation pour un débit sur un compte général ? » / « 40. Et 50 pour un crédit sur un compte général. » ; « Qu'est-ce qui distingue la date comptable de la date de pièce ? » / « La date comptable fixe la période où l'écriture compte ; la date de pièce reprend celle du document d'origine. » ; « Quel objet regroupe la liste des comptes généraux utilisables par une société ? » / « Le plan comptable. » — tags « Vu hier », « Vu hier », « Prérequis · module 2 » ; créneau 13:50 avant le quiz de 14:00) ; à défaut, compléter le seed.
7. Tests (section 12). Commit `test(SPEC-714): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/automations/src/definitions/echauffement.ts` (+ test), `packages/services/src/warmup/{get-today.ts,answer.ts}` (+ tests), `packages/contracts/src/warmup.ts`, routes `apps/web/app/api/v1/warmups/**`, `apps/web/components/home/WarmupCard.tsx` (+ test), `packages/automations/test/integration/echauffement.test.ts`, `apps/web/e2e/specs/automations/echauffement.spec.ts`.
- **Modifiés** : `packages/contracts/src/automations.ts`, `packages/automations/src/registry.ts`, `apps/web/app/(app)/accueil/page.tsx`, composant de liste « Votre journée » (SPEC-603), `apps/web/messages/fr.ts`, `docs/architecture/api.md` (deux routes), seed si nécessaire.
- **Lus / réutilisés** : `selectWarmupNotions` (SPEC-410), service d'application des réponses (SPEC-411), `@learny/ui` (Button, Badge, Card).

## 10. Interface et conformité visuelle

- SCR-03, `design/maquettes/Main.dc.html`, état par défaut, référence `design/references/SCR-03-desktop.png`.
- Structure : rangée sous « Votre journée » : à gauche `section#echauffement` `data-testid="warmup-card"` (fond `#FFFFFF`, bordure `#E7E6E1`, rayon 24 px, padding 22/24 px) ; titre `warmup-title` « Échauffement · avant votre quiz de 14:00 » (18 px, 600) ; sous-titre « 3 questions de rappel, 2 minutes : la veille et les prérequis du chapitre. » ; compteur `warmup-progress` « Question 1 sur 3 » ; segments `warmup-segments` ; zone question (fond `#F8F8F6`, rayon 18 px) avec `warmup-tag` « Vu hier », `warmup-question` « Quelle clé de comptabilisation pour un débit sur un compte général ? », `warmup-reveal` « Voir la réponse » (fond `#111113`) ; après révélation `warmup-answer`, `warmup-knew` « Je savais » (fond `#C6F432`), `warmup-review` « À revoir » (bordure `#DAD9D3`) ; fin `warmup-done`, `warmup-score`, `warmup-follow`, `warmup-next`, `warmup-restart`.
- Dans « Votre journée » : ligne `day-item-warmup` « 13:50 · Échauffement · 3 questions de rappel · 2 min · ajouté par le tuteur · Faire ».
- États : chargement → squelette de la carte ; erreur → ErrorState « Impossible de charger l'échauffement. » + « Réessayer » ; aucun échauffement → carte absente (la colonne de droite s'étend).
- Contrôles : jetons (`expectTokens` sur carte, boutons, pastilles), structure et textes ci-dessus, comparaison ≤ 12 % avec `design/references/SCR-03-desktop.png` (horloge figée 2026-11-11T12:20:00Z, seed SPEC-115), ligne de base `toHaveScreenshot('accueil-echauffement-fin.png', { maxDiffPixelRatio: 0.01 })` de l'état terminé.

## 11. Critères d'acceptation

- **CA-1** Au tick de 06 h d'un jour comportant une séance, une activité `warmup` de N questions conformes à la portée et un créneau de `ceil(N×40/60)` min placé 10 min avant la prochaine séance sont créés, avec l'action `warmup_added`.
- **CA-2** Si la séance commence sans échauffement fait, le créneau est déplacé avant la séance suivante du jour ; sans séance suivante, il est `missed` et l'action `expired`.
- **CA-3** Sur l'accueil (seed), le bloc reproduit la maquette ; « Voir la réponse » puis « Je savais », « Je savais », « À revoir » affiche « Échauffement fait : 2 sur 3 » et « À revoir : « Quel objet regroupe la liste des comptes généraux utilisables par une société ». Cette notion repasse dans le quiz global de ce soir. ».
- **CA-4** La notion « À revoir » figure dans la session du quiz global du jour (non commencée) ; un `review_log` source `warmup` existe pour chaque réponse de la première passe ; « Recommencer » n'en crée aucun.
- **CA-5** Désactivé, en pause globale, sans notion disponible, ou en double déclenchement : aucune création.
- **CA-6** L'annulation avant la première réponse archive l'activité et retire le créneau ; après, elle est refusée (422).
- **CA-7** Les routes respectent RLS (404 pour un autre utilisateur) et l'idempotence (409 sur position déjà répondue).
- **CA-8** Contrôles visuels et axe réussis sur l'accueil.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-714] échauffement …')`) : durée du créneau et heure (EF-4) ; sélection de la prochaine séance et déplacement (EF-5) ; textes `explain` et de fin (EF-7, EF-10, deux tons) ; `WarmupCard.test.tsx` (progression, révélation, focus, fin, recommencer sans appel réseau).
- **Intégration** (`[SPEC-714]`, base réelle, horloge 06:05 → 09:10 → 14:05 → 23:59 locale, ticks exécutés directement) dans `packages/automations/test/integration/echauffement.test.ts` : génération (CA-1) ; déplacement et expiration (CA-2) ; réponses → FSRS, `review_logs`, ajout à la session (CA-4) ; session du soir déjà jouée → `due_at` lendemain ; cas de non-création (CA-5) ; undo (CA-6) ; RLS et 409 sur les routes (CA-7).
- **End-to-end** (`apps/web/e2e/specs/automations/echauffement.spec.ts`, seed, horloge figée, vidéo) : `test('échauffement de l'accueil jusqu'au score @SPEC-714', …)` : cliquer « Faire » dans « Votre journée » (défilement vers `#echauffement`), dérouler les 3 questions (CA-3), puis ouvrir `/formations/<sap>/quiz-global` et vérifier la présence de la notion « Plan comptable » (CA-4). Axe.
- **Visuel** (`test('bloc d'échauffement conforme @SPEC-714 @visual', …)`) : jetons, structure, comparaison ≤ 12 % avec `design/references/SCR-03-desktop.png`, ligne de base de l'état terminé (CA-8).
- **Non-régression** : `@SPEC-603`, `@SPEC-701`, `@SPEC-711`, `pnpm test:unit -t SPEC-410`.

| Critère | Tests |
|---|---|
| CA-1 | intégration « génération » ; unitaire durée |
| CA-2 | intégration « déplacement et expiration » ; unitaire EF-5 |
| CA-3 | e2e ; unitaire `WarmupCard` |
| CA-4 | intégration « réponses » ; e2e |
| CA-5 | intégration « non-création » |
| CA-6 | intégration « undo » |
| CA-7 | intégration « routes » |
| CA-8 | visuel `@visual` ; axe |

## 13. Preuves attendues

`evidence/SPEC-714/` : vidéo `video/echauffement.webm`, captures `screenshots/echauffement-question.png`, `screenshots/echauffement-reponse.png`, `screenshots/echauffement-fin.png`, `screenshots/quiz-global-notion-ajoutee.png`, comparaison `visual/SCR-03-echauffement-side-by-side.png` et diff avec taux, rapports, `acceptance.md`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; de plus : les deux routes ajoutées à `docs/architecture/api.md` ; le bloc reproduit textes et couleurs de la maquette ; aucune question n'est générée par IA à la volée.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0025 (note FSRS : « Je savais » = Good, « À revoir » = Again, par analogie avec l'auto-évaluation de BR-MEM-02), ADR-0034, ADR-0047, ADR-0067, ADR-0190.
- Décisions : échauffement placé 10 min avant la prochaine séance et suivi au fil de la journée (explique la ligne 13:50 de la maquette) ; génération à 06 h ; une seule passe enregistrée ; notions « À revoir » insérées en tête de la session du soir ; textes de bloc au vouvoiement (libellés fixes, BR-ACC-05) ; ADR-0193 (priorité des formats imposés au quiz global : un ajout par l'échauffement n'impose pas de format).
- Routes nouvelles signalées : `GET /api/v1/warmups/today`, `POST /api/v1/warmups/:activityId/answers`. Aucune colonne nouvelle.
