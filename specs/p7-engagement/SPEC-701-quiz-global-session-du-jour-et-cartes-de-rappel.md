---
id: SPEC-701
title: "Quiz global : session du jour et cartes de rappel"
phase: P7
priority: V1
depends_on: [SPEC-406, SPEC-503, SPEC-411, SPEC-513]
business_rules: [BR-MEM-03, BR-MEM-08, BR-MEM-09, BR-MEM-10]
screens: [SCR-10]
adrs: [ADR-0025, ADR-0180]
visual: mockup
---

# SPEC-701 — Quiz global : session du jour et cartes de rappel

## 1. Objectif

Livrer la **session quotidienne de quiz global** d'une formation : création idempotente de la session du jour à partir des notions dues (tirage du moteur, SPEC-406), écran `/formations/[fid]/quiz-global` conforme à `design/maquettes/QuizGlobal.dc.html` (en-tête, sélecteur de durée, progression, rail des jeux, encadré « Réglé par le tuteur », zone de jeu, Passer/Suivant, écran de fin), jeu **carte de rappel** complet (retourner, auto-évaluation avec échéances), enregistrement de chaque réponse avec mise à jour FSRS immédiate. Les quatre autres jeux sont livrés par SPEC-702, la micro-séance par SPEC-703.

## 2. Contexte

Le quiz global est le cœur de la mémorisation (vision §2, frein « mémorisation fragile »). Il est propre à chaque formation et rassemble les notions dues de tous les modules validés et du module en cours déjà évalué, lacunes en tête, modules entrelacés, durée plafonnée (automatisme 7). Aucun appel IA n'a lieu pendant la session (BR-IA-09) : les briques viennent des banques préparées à l'avance (SPEC-513, ADR-0026), la correction et les dates de révision sont calculées par le code (ADR-0020, ADR-0025).

Documents à lire : `docs/product/business-rules.md` (MEM, AUT-05, AUT-07, GAM-01), `docs/architecture/data-model.md` §5 (activities, attempts, answers) et §6 (notion_states, review_logs), `docs/architecture/api.md` (ligne « Quiz global, hors ligne »), `docs/architecture/overview.md` §5 (événement `review/answered`), `docs/engineering/testing.md` §6, `design/maquettes/QuizGlobal.dc.html` (balisage complet et script `renderVals`), ADR-0025, ADR-0180.

## 3. Dépendances

- **SPEC-406** (tirage de la session) : fonction pure `selectGlobalQuizSession(input)` de `@learny/learning-engine` qui reçoit les états des notions (`NotionState[]`), les lacunes, le plafond de durée et le taux visé, la préférence de jeux, l'historique des formats récents, et renvoie `{ items: SessionItemPlan[], deferred: DeferredNotion[], dueCount, estimatedSec }` (`SessionItemPlan = { notionIds, format, reasonKey | null, moduleIds }`). Le mode `micro` du même tirage est utilisé par SPEC-703.
- **SPEC-402** (via SPEC-406) : `previewRatings(card, now)` → échéance par note (`again|hard|good|easy`), `ratingFromAnswer({ correct, timeMs, medianMs })`.
- **SPEC-503** : composants de rendu `RecallCardView` (et, pour SPEC-702, `MatchingView`, `OrderingView`, `CategorizationView`, `ClozeView`), fonction `toClientPayload(type, payload)` qui retire les solutions des charges envoyées au navigateur.
- **SPEC-502** (via SPEC-503) : `gradeBrick(type, payload, response)` → `{ isCorrect, score, perNotion, correction }`.
- **SPEC-411** : `services.learning.applyReviewResult(tx, { userId, notionId, source, correct, rating, timeMs, answerId, reviewedAt })` (écrit `review_logs`, `notion_states`, maîtrise, lacunes, `daily_activity`) et `services.learning.getDueNotions(ctx, formationId, day)`.
- **SPEC-513** : `services.questionBank.pickVariant(tx, { userId, notionIds, format, excludeFingerprints })` → brique de banque non vue ou `null` ; `services.questionBank.requestRefill(userId, notionId, format)` (émet la demande de génération en lot).
- **SPEC-304/305/306** (coquille) : menu latéral (badge « Quiz global »), en-tête et panneau des notifications, réutilisés tels quels.
- **SPEC-115** : le jeu de démonstration doit contenir la session du 11 novembre 2026 de « SAP S/4HANA Finance » (5 items, 14 notions, 18 dues dont 4 reportées à jeudi) décrite en §10.
- Externes : aucune. IA : aucune (`LLM_MODE` sans effet sur cette spécification).

## 4. Règles métier couvertes

- **BR-MEM-03** — Le service `getOrCreateTodaySession` collecte les notions `in_review` dues au plus tard à la fin de la journée locale (fuseau de l'utilisateur, BR-ACC-07) pour les modules validés et le module en cours déjà évalué, puis délègue l'ordre (lacunes en tête), l'entrelacement des modules et le plafond (paramètres de l'automatisme 7 lus dans `automation_settings`) à `selectGlobalQuizSession`.
- **BR-MEM-08** — L'écran affiche le rail des jeux (statuts « Fait », « En cours », « À venir »), la barre de progression segmentée, la raison du choix du tuteur (encadré « Réglé par le tuteur » et ligne de raison par jeu), le bouton « Passer » et un écran de fin (notions revues, réussies espacées davantage, à revoir plus tôt, série).
- **BR-MEM-09** — Toute brique au statut `reported` ou `retired` est exclue du tirage ; si elle est signalée après la création de la session et n'a pas encore reçu de réponse, son item est retiré (`withdrawn`) au chargement suivant et la notion reste due.
- **BR-MEM-10** — Après chaque réponse (auto-évaluation de la carte, vérification d'un jeu), la correction et l'explication sont affichées immédiatement et la réponse n'est plus modifiable.

## 5. Exigences fonctionnelles

- **EF-1 — Accès.** La route `/formations/[fid]/quiz-global` est accessible depuis le menu (« Quiz global »), l'accueil (« Jouer maintenant »), l'agenda (« Ouvrir » sur un créneau quiz global) et la notification « Quiz global du jour ». Une formation dont l'utilisateur n'est ni propriétaire ni membre renvoie la page 404 ; une formation `paused` affiche l'état « Formation en pause » (EF-12).
- **EF-2 — Création de la session du jour.** Au premier chargement de la journée locale, une activité `global_quiz_session` (`for_date` = jour local, `config.mode = 'full'`) et une tentative `in_progress` (`attempt_no = 1`) sont créées. Les chargements suivants du même jour renvoient la même session (idempotence par `(owner_id, formation_id, kind, for_date, config.mode)`).
- **EF-3 — En-tête.** Sur-titre `« {Titre de la formation} · session du {jour de la semaine} {jour} {mois} »` (ex. « SAP S/4HANA Finance · session du mercredi 11 novembre »), titre `Quiz global`. Trois pastilles : `{n} notions` (nombre de notions distinctes couvertes par les items non retirés ; `1 notion` au singulier), libellé des modules (`Module {n}` si un seul module, `Modules {a} et {b} mêlés`, `Modules {a}, {b} et {c} mêlés` au-delà), `≈ {m} min` (estimation arrondie à la minute supérieure, minimum 1).
- **EF-4 — Sélecteur de durée.** Groupe `role="group"` libellé « Durée de la séance » avec deux boutons à `aria-pressed` : `Séance complète · {m} min` (m = estimation de la session complète) et `Micro-séance · {d} min` (d = durée de l'automatisme 2, défaut 5). Dans cette spécification, seul le mode complet est actif ; le bouton micro est rendu `disabled` jusqu'à SPEC-703. Note à droite : si des notions ont été reportées, `« {due} notions étaient dues aujourd’hui : {k} sont reportées à {jour} pour que vos révisions restent sous {plafond} min. »` (jour = « demain » si J+1, sinon nom du jour en minuscules : « jeudi ») ; sinon `« {n} notions à revoir aujourd’hui, lacunes en priorité. »` ; suivi du lien `Régler` vers `/parametres#automatismes`.
- **EF-5 — Progression.** Barre de N segments (un par item non retiré) : segment fait `#111113`, segment courant `#C6F432`, segment à venir `#E7E6E1` ; libellé `Jeu {i} sur {N}` puis `Terminé`.
- **EF-6 — Rail des jeux.** `nav` libellé « Jeux de la session » ; un bouton par item : numéro (1..N), nom du jeu (« Carte de rappel », « Association », « Remise en ordre », « Classement », « Texte à trous », « Question »), libellé de la notion, raison facultative (ex. « Choisi pour votre oubli », fournie par l'item, couleur `#8F3305`), pastille de statut `Fait` / `En cours` / `À venir`. L'item courant porte `aria-current="step"`. Un clic sur un item l'affiche (un item déjà répondu s'affiche en lecture seule avec sa correction).
- **EF-7 — Encadré « Réglé par le tuteur ».** Section sombre contenant au plus trois puces générées par le code au moment de la création (ADR-0180) : « **Lacune en priorité :** … », « **Charge lissée :** {k} notions sur {due} reportées à {jour}, pour rester sous {plafond} min par jour. », « **Modules mêlés :** retrouver la bonne notion parmi d'autres la fixe mieux. ». La section n'est pas rendue si aucune puce ne s'applique.
- **EF-8 — En-tête de jeu.** Titre = nom du jeu, sous-titre `{libellé de la notion} · {Module n | Modules a et b}`, pastille de technique : carte de rappel et texte à trous « Rappel actif », association « Notions proches », remise en ordre « Séquence », classement « Catégorisation », question à choix « Question ».
- **EF-9 — Carte de rappel.** Recto : étiquette `Recto · cherchez de tête`, question (`payload.front`), bouton `Retourner la carte`. Après retournement : verso sombre, étiquette `Verso · réponse`, réponse (`payload.back`), ligne `Source : votre cours du module {n}, chapitre {m}` (origine `resource`/cours) ou `Source : connaissances du tuteur` (origine `tutor`) ; puis `Aviez-vous trouvé ?` et le groupe « Auto-évaluation » de quatre boutons `Raté`, `Difficile`, `Bon`, `Facile`, chacun avec l'échéance prévisionnelle (`Demain`, `Dans 2 jours`, `Dans 6 jours`, `Dans 2 semaines` sur les données de démonstration ; format en ET-7). Un clic enregistre la réponse immédiatement (BR-MEM-02), marque le bouton `aria-pressed="true"` et verrouille les trois autres (`disabled`).
- **EF-10 — Passer / Suivant.** Pied de la zone de jeu : `Passer` (discret) et bouton principal citron `Suivant`, `Terminer la session` sur le dernier item. `Passer` enregistre l'item comme passé (aucune mise à jour FSRS, la notion reste due) et avance ; il est désactivé une fois l'item répondu. `Suivant` est désactivé tant que l'item courant n'est ni répondu ni passé. Après le dernier item, `Terminer la session` appelle la clôture et affiche l'écran de fin. Un item non traité laissé derrière (navigation par le rail) est compté comme passé à la clôture.
- **EF-11 — Écran de fin.** Pastille `Session terminée`, titre `{n} notions revues en {m} minutes` (m = durée réelle arrondie, minimum 1 ; `1 minute` au singulier), trois cartes : `{ok}` « notions réussies, espacées davantage » (notions dont la note est `hard`, `good` ou `easy`), `{soon}` « reviendront plus tôt » (notions notées `again` ou passées), `{s} j` « de série » (série après clôture, SPEC-409), phrase `Prochaine session : {demain|nom du jour + date}, {HH:MM}.` (prochain créneau `global_quiz` planifié de la formation) ou `Aucune session planifiée pour l’instant.`, lien `Retour à l'accueil` vers `/accueil`. Revenir sur la page le même jour réaffiche cet écran.
- **EF-12 — États.** Chargement : squelettes du rail et de la zone de jeu. Vide (aucune notion due) : `EmptyState` titre `Rien à revoir aujourd’hui`, texte `Toutes vos notions sont à jour. Le prochain quiz global sera prêt dès que des notions seront dues.`, action `Retour à l'accueil`. Formation en pause : `EmptyState` titre `Formation en pause`, texte `Le quiz global reprendra quand vous relancerez cette formation.`. Erreur : `ErrorState` avec `Réessayer`. Erreur d'envoi d'une réponse : message `Votre réponse n’a pas pu être enregistrée. Réessayez.` (rôle `alert`) et bouton `Réessayer` ; la réponse n'est considérée enregistrée qu'après 200.
- **EF-13 — Série.** La clôture d'une session ayant au moins une réponse non passée rend la journée qualifiante (`daily_activity.qualifying = true`, source `global_quiz`, BR-GAM-01).

## 6. Exigences techniques

- **ET-1 — Contrats** (`packages/contracts/src/review.ts`) :
  - `GlobalQuizModeSchema = z.enum(['full','micro'])`.
  - `ReviewItemDtoSchema = { position: int≥0, brickId: uuid, brickVersionId: uuid, type: BrickType, name: string, tech: string, displayLabel: string, scopeLabel: string, reason: string|null, notionIds: uuid[], payload: unknown /* client-safe */, intervals: { again, hard, good, easy: string } | null /* carte de rappel */, state: 'todo'|'answered'|'skipped'|'withdrawn', result: ReviewAnswerResultDto | null }`.
  - `GlobalQuizSessionDtoSchema = { sessionId: uuid, attemptId: uuid, formationId: uuid, forDate: 'YYYY-MM-DD', mode, status: 'in_progress'|'completed'|'empty'|'paused', header: { notionCount, modulesLabel, estimatedMinutes, subtitle }, modeOptions: { fullMinutes, microMinutes }, note: string, rationale: { label: string, text: string }[], items: ReviewItemDto[], currentPosition: int, summary: ReviewSummaryDto | null }`.
  - `ReviewAnswerInputSchema = { position, clientAnswerId: uuid, timeMs: int 0..3_600_000, skipped?: true, response?: unknown }` (exactement l'un de `skipped`/`response`) ; pour la carte de rappel `response = { selfRating: 'again'|'hard'|'good'|'easy' }`.
  - `ReviewAnswerResultDtoSchema = { position, skipped: boolean, isCorrect: boolean|null, correction: unknown|null, explanation: string|null, notions: { notionId, rating, nextDueAt }[] }`.
  - `ReviewSummaryDtoSchema = { reviewedCount, minutes, okCount, soonCount, streakDays, nextSessionAt: string|null }`.
- **ET-2 — API** (wrapper `handler()` de SPEC-201, limitation par défaut) :
  - `GET /api/v1/formations/:fid/global-quiz/today?mode=full` → 200 `GlobalQuizSessionDto` ; 404 `NOT_FOUND` (formation inaccessible) ; 400 `VALIDATION_FAILED` (mode inconnu). Crée la session si besoin (lecture avec effet de bord idempotent, verrou consultatif `pg_advisory_xact_lock(hashtext(userId||fid||forDate||mode))`).
  - `POST /api/v1/review-sessions/:sid/answers` → 200 `ReviewAnswerResultDto` ; idempotent par `clientAnswerId` (même identifiant → même résultat, sans double écriture) ; 409 `CONFLICT` si la position a déjà une réponse avec un autre `clientAnswerId` ; 422 `SESSION_CLOSED` (nouveau code ajouté au catalogue `packages/core/src/errors.ts`) si la tentative n'est plus `in_progress` ; 404 si la session n'appartient pas à l'utilisateur.
  - `POST /api/v1/review-sessions/:sid/complete` → 200 `ReviewSummaryDto` ; idempotent (une seconde clôture renvoie le même résumé).
  - `:sid` est l'identifiant de l'activité `global_quiz_session`.
- **ET-3 — Service** `packages/services/src/review/global-quiz.ts` :
  - `getOrCreateTodaySession(ctx, formationId, mode): Promise<Result<GlobalQuizSessionDto, AppError>>` ; algorithme en §8.
  - `answerReviewItem(ctx, sessionId, input): Promise<Result<ReviewAnswerResultDto, AppError>>` ; transaction unique : insertion `answers` (`response`, `is_correct`, `score`, `max_score`, `time_ms`, `graded_by='code'`, `feedback`), pour chaque notion de l'item `applyReviewResult(... source: 'global_quiz' ...)`, puis émission (après commit) de `review/answered` `{ userId, formationId, notionIds, answerId, source: 'global_quiz' }`.
  - `completeReviewSession(ctx, sessionId): Promise<Result<ReviewSummaryDto, AppError>>` ; marque les items non traités comme passés (`answers.response = {skipped:true}`, `is_correct = null`), passe la tentative à `graded` (`submitted_at`, `duration_ms` = horloge − `started_at`, `score` = part des réussites), met à jour `daily_activity` via SPEC-411, calcule le résumé.
- **ET-4 — Note FSRS.** Carte de rappel : note = auto-évaluation (BR-MEM-02). Autres formats (SPEC-702) : note par notion via `ratingFromAnswer` (justesse de la notion dans l'item, temps de l'item divisé par le nombre de notions, médiane par format, ADR-0025). Passer : aucune note.
- **ET-5 — Persistance de la raison.** `activities.config` de la session contient `{ mode, forDate, dueCount, deferredCount, deferredTo, capMinutes, estimatedSec, rationale: [{label,text}], items: [{ position, format, reasonKey, displayLabel, moduleIds }] }` ; `activities.items` contient `[{ brickId, brickVersionId }]` dans le même ordre (ADR-0180). Les textes sont figés à la création.
- **ET-6 — Exclusion (BR-MEM-09).** `pickVariant` ne renvoie jamais une brique `reported`/`retired`. Au `GET`, tout item non répondu dont la brique est devenue `reported` passe `withdrawn` (champ `withdrawn: true` ajouté dans `config.items[i]`, aucune colonne nouvelle).
- **ET-7 — Format des échéances** (`apps/web/lib/format/interval.ts`, fonction pure `formatDueInterval(dueAt, now, tz)`) : même jour local → `Aujourd’hui` ; J+1 → `Demain` ; J+2..J+13 → `Dans {n} jours` ; J+14..J+59 → `Dans {floor(n/7)} semaines` (`Dans 1 semaine` jamais produit puisque n≥14) ; ≥ J+60 → `Dans {round(n/30)} mois`. Les jours sont comptés en dates civiles dans le fuseau de l'utilisateur.
- **ET-8 — Durée estimée par format** (constante `REVIEW_FORMAT_SECONDS` de `packages/config/src/product.ts`) : `recall_card` 30, `cloze` 45, `choice_question` 40, `ordering` 60, `matching` 90, `categorization` 90.
- **ET-9 — Client.** Page Server Component `apps/web/app/(app)/formations/[fid]/quiz-global/page.tsx` qui précharge le DTO ; composant client `GlobalQuizSession` avec TanStack Query (`['global-quiz', fid, mode]`, ADR-0063), mutation par réponse avec `clientAnswerId = crypto.randomUUID()` conservé jusqu'au succès (réessai sans doublon). Le temps de réponse est mesuré côté client depuis l'affichage de l'item (`performance.now()`), borné à 3 600 000 ms.
- **ET-10 — Accessibilité.** Rail = `nav` + boutons ; zone de jeu = `section` étiquetée par le titre du jeu ; changement d'item : focus déplacé sur le titre du jeu (`tabIndex=-1`) ; correction annoncée dans une région `aria-live="polite"` ; carte retournée : focus sur le premier bouton d'auto-évaluation ; `prefers-reduced-motion` : aucun effet de retournement animé.
- **ET-11 — Performances.** `GET today` p95 < 300 ms sur la base de démonstration (ADR-0041) ; aucune requête N+1 (briques chargées en une requête `where id = any(...)`).
- **ET-12 — Sécurité.** Client utilisateur `userDb(ctx)` (RLS) pour toutes les lectures/écritures ; les solutions des jeux ne sont jamais envoyées avant la réponse (`toClientPayload`).

## 7. Comportements attendus et cas limites

- **CL-1 — Aucune notion due.** `status = 'empty'`, aucune activité créée, état vide d'EF-12 ; le badge du menu affiche 0 (masqué selon SPEC-304).
- **CL-2 — Session commencée la veille.** À l'ouverture, une tentative `in_progress` d'une session dont `for_date` < aujourd'hui (jour local) est close : items non traités passés, tentative `abandoned` ; aucune série n'est attribuée à la veille si aucune réponse n'avait été donnée ; la session du jour est créée normalement. Les réponses déjà données la veille ont mis à jour FSRS au moment de la réponse.
- **CL-3 — Minuit pendant la session.** Une réponse envoyée après minuit (fuseau utilisateur) à une session d'hier est acceptée si la tentative est encore `in_progress` (ses effets FSRS utilisent l'heure réelle) ; la clôture compte pour le jour de la clôture (`daily_activity` du jour local courant).
- **CL-4 — Fuseau modifié.** Le jour local est recalculé avec le fuseau courant du profil à chaque requête ; si le changement fait passer à un nouveau jour, une nouvelle session est créée ; une session existante n'est jamais déplacée.
- **CL-5 — Double clic / réseau lent.** Deux envois de la même réponse portent le même `clientAnswerId` → une seule écriture, même résultat ; boutons d'auto-évaluation désactivés pendant l'envoi.
- **CL-6 — Deux onglets.** Réponse à une position déjà répondue depuis l'autre onglet → 409 ; le client recharge la session et affiche la correction existante.
- **CL-7 — Banque épuisée pour une notion.** `pickVariant` essaie les autres formats autorisés par le tirage ; si aucune variante n'existe, la notion est retirée de la session du jour, reportée au lendemain (reste due), et `requestRefill` est appelée ; aucun appel IA synchrone.
- **CL-8 — Brique signalée pendant la session** (BR-MEM-09) : voir ET-6 ; si tous les items sont retirés, `status = 'empty'`.
- **CL-9 — Plafond atteint (lissage).** Les notions reportées par le tirage restent dues ; la note et la puce « Charge lissée » l'indiquent ; `deferredTo` = premier jour d'étude suivant (rythme de l'utilisateur).
- **CL-10 — Formation terminée en entretien léger.** Mode et plafond imposés par SPEC-617 (5 min) ; formation `completed` avec entretien `stopped` → 404 `NOT_FOUND` côté API et page 404.
- **CL-11 — Formation à plusieurs.** La session ne contient que les notions et briques de l'utilisateur courant (banques privées, ADR-0026).
- **CL-12 — Clôture sans aucune réponse.** Autorisée ; résumé avec `reviewedCount = 0` affiché « 0 notion revue en 1 minute » ; journée non qualifiante.
- **CL-13 — Hors ligne.** Hors périmètre ici (SPEC-801) ; en cas d'échec réseau, EF-12.

## 8. Instructions d'implémentation

1. **Contrats** : créer `packages/contracts/src/review.ts` (ET-1), l'exporter depuis l'index, ajouter le code `SESSION_CLOSED` (422) à `packages/core/src/errors.ts`. Commit `feat(SPEC-701): contrats du quiz global`.
2. **Constantes** : ajouter `REVIEW_FORMAT_SECONDS` et `GAME_LABELS` (`{ recall_card: { name: 'Carte de rappel', tech: 'Rappel actif' }, … }`) dans `packages/config/src/product.ts`.
3. **Service de session** `packages/services/src/review/global-quiz.ts` :
   1. calculer `today = startOfUserDay(clock.now(), tz)` (SPEC-207) ;
   2. clore les sessions `in_progress` antérieures (CL-2) ;
   3. chercher l'activité du jour (`kind='global_quiz_session'`, `for_date`, `config->>'mode'`) ; si trouvée → construire le DTO ;
   4. sinon : vérifier le statut de la formation (pause → DTO `paused`) ; charger `getDueNotions(ctx, fid, today)`, les lacunes, `automation_settings` (`plafond_quiz`, `jeu_lacune`, valeurs par défaut des contrats si absentes), les 20 derniers `review_logs` pour la variation des formats ;
   5. appeler `selectGlobalQuizSession` ; pour chaque `SessionItemPlan`, `pickVariant` (CL-7) ;
   6. si aucun item → DTO `empty` sans écriture ;
   7. générer la justification (ADR-0180) et insérer activité + tentative dans une transaction sous verrou consultatif.
4. **Construction du DTO** : charger les versions de briques en une requête, appliquer `toClientPayload`, calculer `intervals` pour les cartes de rappel avec `previewRatings` + `formatDueInterval`, état des items depuis `answers`.
5. **Réponse** `answerReviewItem` (ET-3, ET-4) avec idempotence : rechercher d'abord une réponse dont `feedback->>'clientAnswerId'` égale l'identifiant reçu (le `clientAnswerId` est stocké dans `answers.feedback.clientAnswerId`).
6. **Clôture** `completeReviewSession` (ET-3), résumé : `streakDays` via `services.streak.getStreak(ctx)` (SPEC-409/411), `nextSessionAt` = premier `schedule_slots` `kind='global_quiz'`, `status='planned'`, `starts_at > now`, même formation.
7. **Routes** : `apps/web/app/api/v1/formations/[fid]/global-quiz/today/route.ts`, `apps/web/app/api/v1/review-sessions/[sid]/answers/route.ts`, `.../complete/route.ts` ; ajouter `SESSION_CLOSED` à la génération OpenAPI. Commit `feat(SPEC-701): service et API de la session du jour`.
8. **Formatage** `apps/web/lib/format/interval.ts` (ET-7) et `apps/web/lib/format/modules-label.ts`.
9. **Messages** : ajouter la section `globalQuiz` dans `apps/web/messages/fr.ts` avec tous les textes de §5 et §10.
10. **Composants** dans `apps/web/components/global-quiz/` : `GlobalQuizHeader.tsx`, `SessionModeSwitch.tsx` (utilise `SegmentedControl` de `@learny/ui`), `SessionProgress.tsx`, `GameRail.tsx`, `TutorRationale.tsx`, `GamePanel.tsx` (aiguillage par type de brique ; pour les types non encore livrés, rend la vue de SPEC-503 en mode lecture avec « Vérifier » désactivé jusqu'à SPEC-702), `RecallCardGame.tsx` (enveloppe de `RecallCardView` avec auto-évaluation et échéances), `SessionFooter.tsx`, `SessionEnd.tsx`, `GlobalQuizSession.tsx` (orchestration, état courant, mutations).
11. **Page** `apps/web/app/(app)/formations/[fid]/quiz-global/page.tsx` + `loading.tsx` + `error.tsx`. Commit `feat(SPEC-701): écran du quiz global et carte de rappel`.
12. **Tests** (§12), puis mise à jour du tableau de `docs/architecture/api.md` si une ligne change (aucune route nouvelle ; ajouter le code `SESSION_CLOSED` à la liste des codes). Commit `test(SPEC-701): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/review.ts` ; `packages/services/src/review/global-quiz.ts`, `packages/services/src/review/rationale.ts`, `packages/services/src/review/index.ts` ; `apps/web/app/api/v1/formations/[fid]/global-quiz/today/route.ts` ; `apps/web/app/api/v1/review-sessions/[sid]/answers/route.ts` ; `apps/web/app/api/v1/review-sessions/[sid]/complete/route.ts` ; `apps/web/app/(app)/formations/[fid]/quiz-global/{page,loading,error}.tsx` ; `apps/web/components/global-quiz/*.tsx` (liste §8.10) ; `apps/web/lib/format/interval.ts`, `apps/web/lib/format/modules-label.ts` ; tests listés en §12.
- **Modifiés** : `packages/core/src/errors.ts` (code `SESSION_CLOSED`) ; `packages/config/src/product.ts` (constantes) ; `apps/web/messages/fr.ts` (section `globalQuiz`) ; `packages/contracts/src/index.ts` ; `docs/architecture/api.md` (code d'erreur).
- **Lus / réutilisés** : `@learny/learning-engine` (`selectGlobalQuizSession`, `previewRatings`, `ratingFromAnswer`), `@learny/bricks` (`RecallCardView`, `toClientPayload`, `gradeBrick`), `packages/services/src/learning` (SPEC-411), `packages/services/src/question-bank` (SPEC-513), `@learny/ui` (`Button`, `SegmentedControl`, `Badge`, `Card`, `EmptyState`, `ErrorState`, `Skeleton`, `ProgressBar`), coquille SPEC-304 à 306, `packages/core/src/time.ts`.

## 10. Interface et conformité visuelle

- **Maquette** : `design/maquettes/QuizGlobal.dc.html`. **Référence** : `design/references/SCR-10-desktop.png` (état initial : jeu 1, recto) générée par SPEC-005 ; états complémentaires `SCR-10-verso-desktop.png` (carte retournée) et `SCR-10-fin-desktop.png` (écran de fin) si le manifeste de SPEC-005 les fournit.
- **Structure attendue** (ordre DOM, dans le contenu principal de la coquille, largeur max 1160 px à l'échelle maquette) :
  1. `[data-testid=gq-header]` : `p` sur-titre (14 px, `#62626B`), `h1` « Quiz global » (Space Grotesk 34 px, 600) ; `ul` de pastilles `gq-pill-notions` (« 14 notions »), `gq-pill-modules` (« Modules 1 et 2 mêlés »), `gq-pill-duration` (« ≈ 10 min ») — fond blanc, bordure `#E7E6E1`, rayon 999 px.
  2. `[data-testid=gq-mode-switch]` (group « Durée de la séance ») avec `gq-mode-full` (« Séance complète · 10 min », pressé : fond `#111113`, texte blanc) et `gq-mode-micro` (« Micro-séance · 5 min ») ; `p[data-testid=gq-mode-note]` « 18 notions étaient dues aujourd’hui : 4 sont reportées à jeudi pour que vos révisions restent sous 15 min. Régler ».
  3. `[data-testid=gq-progress]` (segments hauteur 8 px, rayon 4 px) + `gq-progress-label` « Jeu 1 sur 5 ».
  4. Colonne gauche : `nav[data-testid=gq-rail]` (carte blanche rayon 24 px) avec `gq-rail-item-1..5` : 1 « Carte de rappel » / « Variante d’exercice » / « Choisi pour votre oubli » / « En cours » ; 2 « Association » / « Notions de base SAP » / « À venir » ; 3 « Remise en ordre » / « Niveaux d’organisation » ; 4 « Classement » / « Données de base et opérations » ; 5 « Texte à trous » / « Fiori et devises ». Pastilles : fait `#E1F4EF`/`#0B5C4D`, en cours `#111113`/blanc, à venir `#F4F4F1`/`#62626B` ; numéros : fait `#111113`/`#C6F432`, en cours `#C6F432`/`#111113`, à venir `#F4F4F1`/`#62626B`. Puis `section[data-testid=gq-rationale]` (fond `#111113`, titre « Réglé par le tuteur » 12 px majuscules `#C6F432`) avec les trois puces exactes de la maquette (données de démonstration).
  5. Colonne droite `section[data-testid=gq-game]` (carte blanche rayon 24 px, padding 28 px) : `h2[data-testid=gq-game-title]` « Carte de rappel », sous-titre « Variante d’exercice · Module 2 », pastille `gq-game-tech` « Rappel actif » (`#F0E9FE`/`#5B21B6`) ; recto `[data-testid=recall-card-front]` (fond `#F8F8F6`, rayon 22 px) « Recto · cherchez de tête », « Que définit une variante d'exercice comptable ? », bouton `recall-card-flip` « Retourner la carte » ; verso `[data-testid=recall-card-back]` (fond `#111113`) « Verso · réponse », « Le nombre de périodes comptables d'un exercice, et leurs dates de début et de fin. », « Source : votre cours du module 2, chapitre 2 » ; « Aviez-vous trouvé ? » et `recall-grade-again|hard|good|easy` (« Raté / Demain », « Difficile / Dans 2 jours », « Bon / Dans 6 jours », « Facile / Dans 2 semaines ») ; pied `gq-skip` « Passer » et `gq-next` « Suivant » (citron `#C6F432`).
  6. Fin `[data-testid=gq-end]` : `Session terminée` (citron), `gq-end-title` « 14 notions revues en 9 minutes », `gq-end-ok` « 11 », `gq-end-soon` « 3 » (`#FFEDE0`/`#8F3305`), `gq-end-streak` « 13 j » (fond `#111113`, chiffre `#C6F432`), `gq-end-next` « Prochaine session : demain, 17:00. », `gq-end-home` « Retour à l'accueil ».
  7. `gq-empty` pour l'état vide.
- **Données de démonstration** (SPEC-115, horloge 2026-11-11T12:20:00Z) : session SAP du jour, 5 items dans l'ordre ci-dessus, 14 notions, 18 dues, 4 reportées au jeudi 12 novembre, plafond 15 min, estimation 10 min, raison « Choisi pour votre oubli » sur l'item 1, `config.rationale` = les trois puces de la maquette. Pour obtenir l'écran de fin de démonstration (« 14 notions revues en 9 minutes », 11 / 3), le test e2e répond selon un script fixe et avance l'horloge du navigateur et du serveur de 9 minutes.
- **Responsive** : sous 900 px, la colonne gauche passe au-dessus de la zone de jeu ; boutons d'auto-évaluation en grille 2×2 sous 480 px ; cibles ≥ 44 px.
- **Contrôles automatisés** (testing.md §6) : `expectTokens` sur `h1` (Space Grotesk, 34 px × 0,9 = 30,6 px calculés), `gq-next` (fond `#C6F432`), `gq-rationale` (fond `#111113`), pastille de technique (`#F0E9FE`), rail (rayon 24 px) ; structure : présence et ordre des régions 1 à 5 et textes exacts ci-dessus ; comparaison avec `SCR-10-desktop.png` ≤ 12 % de pixels différents ; ligne de base `toHaveScreenshot('global-quiz-recto.png')` et `('global-quiz-fin.png')`, `maxDiffPixelRatio: 0.01`.

## 11. Critères d'acceptation

- **CA-1** — Deux `GET today` successifs le même jour renvoient le même `sessionId` ; une seule activité `global_quiz_session` existe pour (utilisateur, formation, jour, mode).
- **CA-2** — La session contient uniquement des notions dues `in_review` de modules validés ou du module en cours évalué, lacunes en premier, et respecte le plafond de 15 min (estimation ≤ 900 s) ; les notions reportées restent dues.
- **CA-3** — Une brique `reported` n'apparaît jamais dans une nouvelle session ; signalée après création, son item passe `withdrawn` et disparaît du rail.
- **CA-4** — Auto-évaluer une carte « Bon » écrit une réponse, un `review_logs` (`source='global_quiz'`, `grade='good'`) et met à jour `notion_states.due_at` à l'échéance affichée sous le bouton ; le bouton reste pressé et la réponse n'est plus modifiable.
- **CA-5** — Un même `clientAnswerId` envoyé deux fois produit une seule réponse et un seul `review_logs`.
- **CA-6** — « Passer » n'écrit aucun `review_logs` et la notion reste due ; elle est comptée dans « reviendront plus tôt ».
- **CA-7** — L'écran de démonstration affiche exactement les textes de §10 (en-tête, note, rail, encadré, carte) et, après le scénario de fin, « 14 notions revues en 9 minutes », 11, 3, « 13 j », « Prochaine session : demain, 17:00. ».
- **CA-8** — La clôture rend la journée qualifiante pour la série et la série affichée augmente de 1 (12 → 13 sur la démonstration).
- **CA-9** — Conformité visuelle : jetons et structure vérifiés, écart ≤ 12 % avec `SCR-10-desktop.png`, aucune violation axe serious/critical.
- **CA-10** — `formatDueInterval` renvoie les libellés d'ET-7 pour J+0, J+1, J+2, J+6, J+13, J+14, J+20, J+60 et J+120.

## 12. Plan de tests

- **Unitaires** (Vitest) :
  - `apps/web/lib/format/interval.test.ts` — `describe('[SPEC-701] formatDueInterval')` : tableaux de cas J+0 → « Aujourd’hui », J+1 → « Demain », J+2 → « Dans 2 jours », J+6 → « Dans 6 jours », J+14 → « Dans 2 semaines », J+20 → « Dans 2 semaines », J+60 → « Dans 2 mois » ; passage à l'heure d'hiver (Europe/Paris, 25 oct. 2026) sans décalage d'un jour (CA-10).
  - `apps/web/lib/format/modules-label.test.ts` — `describe('[SPEC-701] modulesLabel')` : [2] → « Module 2 », [1,2] → « Modules 1 et 2 mêlés », [1,2,4] → « Modules 1, 2 et 4 mêlés ».
  - `packages/services/src/review/rationale.test.ts` — `describe('[SPEC-701] rationale')` : puces générées selon lacune/report/modules ; aucune puce → tableau vide.
  - `apps/web/components/global-quiz/GlobalQuizSession.test.tsx` — `describe('[SPEC-701] GlobalQuizSession')` (Testing Library, MSW) : retourner la carte, focus sur « Raté », clic « Bon » → `aria-pressed`, autres boutons désactivés, « Suivant » activé ; « Passer » appelle l'API avec `skipped: true` ; libellé « Terminer la session » sur le dernier item ; erreur réseau → message `alert` et « Réessayer » réutilise le même `clientAnswerId`.
- **Intégration** (base réelle, horloge figée `createFixedClock('2026-11-11T12:20:00Z')`) :
  - `packages/services/test/integration/global-quiz.test.ts` — `describe('[SPEC-701] session du jour')` : idempotence (CA-1) ; sélection et plafond (CA-2) ; exclusion d'une brique signalée et `withdrawn` (CA-3) ; réponse carte de rappel → `answers`, `review_logs`, `notion_states.due_at` (CA-4) ; idempotence `clientAnswerId` et 409 sur autre identifiant (CA-5) ; passer (CA-6) ; clôture → `daily_activity.qualifying`, résumé (CA-8) ; session de la veille close à l'ouverture (CL-2) ; banque épuisée → notion retirée et `requestRefill` appelée (CL-7) ; RLS : un second utilisateur reçoit 404.
  - `apps/web/test/integration/global-quiz-api.test.ts` — `describe('[SPEC-701] API quiz global')` : codes 200/400/404/409/422 et schémas de sortie validés par Zod.
- **End-to-end** (Playwright, horloge figée, seed SPEC-115, vidéo) — `apps/web/e2e/specs/p7/global-quiz.spec.ts` :
  - `test('session du jour et carte de rappel @SPEC-701')` : connexion d'Alex, `/accueil` → « Jouer maintenant » → vérifier en-tête, note, rail, encadré ; « Retourner la carte » ; vérifier verso et échéances ; « Bon » ; « Suivant » → jeu 2 « En cours », jeu 1 « Fait » ; « Passer » sur les items 2 à 4 (avant SPEC-702) ; item 5 → « Terminer la session » ; écran de fin présent (CA-4, CA-6).
  - `test('écran de fin de démonstration @SPEC-701')` : scénario scripté (réponses prédéfinies, horloge avancée de 9 min) → textes exacts de CA-7 et série 13 (CA-8).
  - `test('état vide @SPEC-701')` : utilisateur de fabrique sans notion due → `gq-empty`.
  - Accessibilité : `expectNoAxeViolations(page)` sur recto, verso, fin.
- **Visuel** — `test('conformité visuelle du quiz global @SPEC-701 @visual')` : `expectTokens`, contrôle de structure (§10), `compareWithReference(page, 'SCR-10-desktop')` ≤ 12 %, `toHaveScreenshot` (CA-9) ; projet `mobile` : capture de non-régression seule.
- **Non-régression** : rejouer `@SPEC-304`, `@SPEC-306`, `@SPEC-603` (accueil : carte « Quiz global du jour »), `[SPEC-406]`, `[SPEC-411]`, `[SPEC-503]`.
- **Traçabilité** :

| Critère | Tests |
|---|---|
| CA-1 | intégration `[SPEC-701] session du jour` (idempotence) |
| CA-2 | intégration (sélection et plafond) |
| CA-3 | intégration (exclusion, withdrawn) |
| CA-4 | intégration (réponse carte) ; e2e `@SPEC-701` session du jour |
| CA-5 | intégration (idempotence) ; unitaire `GlobalQuizSession` (réessai) |
| CA-6 | intégration (passer) ; e2e `@SPEC-701` |
| CA-7 | e2e écran de fin `@SPEC-701` |
| CA-8 | intégration (clôture) ; e2e écran de fin |
| CA-9 | `@SPEC-701 @visual` ; axe dans les e2e |
| CA-10 | unitaire `[SPEC-701] formatDueInterval` |

## 13. Preuves attendues

`evidence/SPEC-701/` : vidéos `video/session-du-jour.webm` et `video/ecran-de-fin.webm` ; captures `screenshots/recto.png`, `verso.png`, `fin.png`, `vide.png` ; `visual/SCR-10-side-by-side.png`, `visual/SCR-10-diff.png` et taux mesuré ; rapports `unit.json`, `integration.json`, `e2e.json` ; temps p95 de `GET today` mesuré dans le test d'intégration (consigné dans `summary.md`).

## 14. Définition de terminé

Définition commune (docs/engineering/testing.md §7) et en plus : la session de démonstration est reproduite à l'identique ; aucun appel au paquet `llm` n'est fait pendant une session (vérifié par un espion dans le test d'intégration) ; le code `SESSION_CLOSED` figure dans l'OpenAPI généré.

## 15. Décisions et hypothèses

- **ADR appliqués** : ADR-0025 (FSRS par notion, médiane par format), ADR-0020 (moteur déterministe), ADR-0026 (banques privées), ADR-0047 (horloge), ADR-0063 (TanStack Query), ADR-0034 (conformité visuelle), ADR-0038 (accessibilité).
- **Décision prise (ADR-0180)** : cycle de vie de la session du jour — une activité par (utilisateur, formation, jour local, mode), textes de justification générés par le code et figés dans `activities.config`, mise à jour FSRS à chaque réponse, « Passer » sans effet FSRS, items non traités passés à la clôture, session de la veille close à l'ouverture.
- **Hypothèses** : SPEC-406 expose `selectGlobalQuizSession` avec la forme décrite en §3 ; si le nom diffère, l'implémenteur adapte l'appel sans changer le comportement. SPEC-513 expose `pickVariant`/`requestRefill` ; à défaut, un adaptateur local est créé dans `packages/services/src/question-bank`. Aucune colonne ni route nouvelle ; un code d'erreur nouveau (`SESSION_CLOSED`).
