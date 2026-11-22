# Correspondance des tests portés — SPEC-2205 (engagement)

Source : `evidence/SPEC-2001/test-port-map.md` et les fichiers de test TypeScript du périmètre
engagement. Chaque cas est rejoué par un test pytest au nom unique ; les tests qui dépendent de la
base (Supabase local) passent par l'intégration serveur, jamais par un mock de la couche de données.

## Domaine pur des notifications (committé)

| Test TypeScript | Cas | Test Python |
|---|---|---|
| `packages/notifications/src/routing.test.ts` | préférences, heures calmes, week-end, plafond, `eligibleAt`/`staleAt` | `tests/unit/engagement/test_engagement_domain.py` (oracle `tools/engagement/oracle.mjs`) |
| `packages/notifications/src/templates/templates.test.ts` | seize gabarits × deux tonalités, bornes, `href` | idem |

## Plateforme (e-mail, push, désinscription)

| Test TypeScript | Cas | Test Python |
|---|---|---|
| `src/email/unsubscribe-token.test.ts` | vecteurs du jeton, altération, mauvaise longueur, identifiant invalide | `tests/unit/engagement/test_engagement_platform.py` |
| `src/email/send.test.ts` | mode `memory`, clé d'idempotence, en-têtes `List-Unsubscribe`, tonalité | idem |
| `src/email/transports/resend.test.ts` | 429/5xx transitoires, 4xx définitifs, timeout | idem |
| `emails/templates.test.tsx` | sujets et textes des gabarits, deux tonalités | idem (textes assertés via `locale_fr.engagement_email`) |
| `src/push/send.test.ts` | décision par abonnement, résumé de tour | idem |
| `src/push/payload.ts` | charge utile bornée, `safeNotificationUrl` | idem + `tests/integration/engagement/test_engagement_notify.py` |
| `test/integration/push.test.ts` | suppression de l'abonnement disparu, compteur remis à zéro | `tests/integration/engagement/test_engagement_notify.py` |

## Services notifications (committé)

| Test TypeScript | Cas | Test Python |
|---|---|---|
| `packages/services/src/notifications/list.test.ts` | groupes, compteurs, filtre non lu, pagination | `tests/integration/engagement/test_engagement_inbox.py` |
| `packages/services/src/notifications/list.service.test.ts` | marquage lu idempotent, 404 étranger, `read-all` | idem |
| `packages/services/src/parametres-notifications.test.ts` | DTO normalisé, patch partiel, 409, compteur, heures calmes | `tests/integration/engagement/test_engagement_settings.py` |
| `src/push/subscriptions.test.ts` | création, rafraîchissement, endpoint étranger, suppression idempotente | `tests/integration/engagement/test_engagement_push_subscriptions.py` |
| `packages/services/src/email/unsubscribe.test.ts` | jeton valide, altéré, compte supprimé | `tests/integration/engagement/test_engagement_unsubscribe.py` |
| `test/integration/notify.test.ts` | dédup, un seul effet, plafond sous verrou, heures calmes | `tests/integration/engagement/test_engagement_notify.py` |
| `test/integration/email.test.ts` | message capturé une fois, gabarit et tonalité | `test_engagement_notify.py` + `test_engagement_platform.py` |

## Moteur d'automatismes (cette tranche)

| Test TypeScript | Cas | Test Python |
|---|---|---|
| `packages/contracts/src/parametres-automatismes.ts` (schémas) + `contracts/automations.ts` | dix schémas, défauts canoniques, alias `questionCount`/`retryDelayHours`/`required`, messages zod exacts | `tests/unit/engagement/test_engagement_automations_domain.py` (oracle `tools/engagement/oracle-automations.mjs`, section `params`) |
| `packages/contracts/src/moteur-d-automatismes.ts` (`AutomationSummary`, `AutomationActionKind`) | résumé d'une ligne ≤ 160, `trim`, refus du retour à la ligne, `snake_case` 1..80 | idem (sections `summaries`, `kinds`) |
| `packages/contracts/src/cursor.ts` | encodage `base64url({k,id})`, curseur forgé → `null` | idem (sections `cursors`, `cursorGarbage`) |
| `parametres-automatismes.test.ts` (`sortAutomationActions`, `weekAutomationJournal`) | ordre stable `(createdAt desc, id asc)`, préfixe hebdomadaire | idem (section `selection`) |
| `packages/db/src/repositories/automation-actions.ts` (`expireDueAutomationActions`) | seule une action `pending_consent` dont `expiresAt` est passé expire | idem (section `expiry`) + `test_engagement_automations_journal.py` (tick réel) |
| `contracts/automatisme-9-bilan-de-la-semaine.ts` (aides pures) | `weeklyReviewWeek`, `isoWeekKey`, `formatWeeklyStudy`, `weeklyRetentionLabel`, `isAtRiskNotion`, `sortAtRiskNotions`, `sumPlanMinutes`, `weeklyPeriodLabel`, `weeklyReceivedLabel` | idem (sections `weeks`, `weekKeys`, `*Labels`, `atRisk`, `planMinutes`) |
| `services/src/pause/index.ts` (`pauseSummary`, `validatePauseEndDate`, `pauseEndDateInZone`) | phrases de la pause (deux tonalités, diagnostic ou reprise directe), date de fin civile, horizon en zone | idem (section `pause`) |
| `moteur-d-automatismes.test.ts` (réglages et journal de service) | dix réglages, défauts canoniques, patch partiel, alias, 400 avec le message zod, RLS, pause active | `tests/integration/engagement/test_engagement_automations_settings.py` |
| `moteur-d-automatismes.test.ts` (journal) | page stable, filtres, curseur, compteur hebdomadaire, RLS, expiration idempotente | `tests/integration/engagement/test_engagement_automations_journal.py` |
| `services/src/weekly-review.ts` (`getWeeklyReview`, `collectWeeklyReviewData`) | état vide explicite, charge figée, recalcul, `actionId` étranger → 404 | `tests/integration/engagement/test_engagement_weekly_review.py` |

## Non porté dans cette tranche

| Test TypeScript | Motif |
|---|---|
| `moteur-d-automatismes.test.ts` (parties `accept`/`decline`/`undo`, `reproposeAfterUndo`) | dépendent des **définitions** (`definition.apply`/`undo`/`explain`) : passe suivante, avec les trois opérations `me.automation-actions.{accept,decline,undo}` |
| `definitions/*.test.ts` (échauffement, jeu-lacune, micro-séance, questions-cartes, remédiation, reprise, pause), `micro-seance/should-propose.test.ts`, `reprise/*.test.ts` | même passe : les définitions ne sont pas encore portées |
| `automatisme-7-quiz-global-plafonne-et-lisse.ts`, `automatisme-8-sprint-avant-un-jalon.ts`, `automatisme-9-bilan-de-la-semaine.ts` (définitions) | effets des automatismes `plafond_quiz`, `sprint`, `bilan` : même passe (les aides pures de `bilan` sont déjà portées et prouvées) |
| `packages/services/src/pause/*.test.ts` | service de pause (4 opérations `me.pause.*`) : passe suivante |
| `packages/services/src/notifications-generation-des-rappels.test.ts` | producteurs de rappels (job), branchés au worker en SPEC-2207 |
| `packages/notifications/src/email/render.ts` (instantané HTML) | l'instantané React Email n'est pas rejoué : les textes et les sujets le sont, la structure DOM diffère (consigné dans `parity.md`) |
