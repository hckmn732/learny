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

## Cas d'usage de job (cette tranche)

| Test TypeScript | Cas | Test Python |
|---|---|---|
| `packages/jobs/src/time-window.ts`, `packages/jobs/src/tick.ts` | fenêtre locale `[T - 5 min, T + 55 min[`, jour local et jour de semaine, heure d'été (heure inexistante et heure ambiguë), zone à demi-heure, heure déjà passée | `tests/unit/engagement/test_engagement_jobs_domain.py` (oracle `tools/engagement/oracle-jobs.mjs`, section `windows`) |
| `packages/notifications/src/digest.ts` (`durationLabel`, `previousCivilDay`, `dateLabel`, `hhmm`) | durées, jour civil précédent (mois et année), libellé long, heure locale, plafond des envois écartés | idem (sections `digestDates`, `reminders`) |
| `packages/notifications/test/integration/notify.test.ts` (programme du jour) | un seul programme par jour local, bloc des envois écartés de la veille, plafond quotidien ignoré, rejeu sans doublon, e-mail capturé une fois | `tests/integration/engagement/test_engagement_jobs.py` |
| `packages/notifications/src/producers/index.ts`, `producers/reminders.ts` (rappels) | 40 minutes avant, clé `validation_soon:<slot>:<startsAt>`, libellé local, fenêtre de l'heure | `test_engagement_jobs_domain.py` (sections `reminders`, `labels`, `window`) |
| `packages/services/src/notifications-generation-des-rappels.test.ts` (rappels) | `expired` (CL-5), `CONFLICT` (CL-2), déplacement qui annule l'ancien rappel (CA-2), fuseau du profil | `test_engagement_jobs.py` + unitaires de `parse_request` |
| `packages/services/test/integration/spec-706.test.ts` (job horaire) | un rappel par quiz de l'heure, rejeu sans doublon, rappel livré conservé, aucun quiz dans l'heure | `test_engagement_jobs.py` |
| `packages/services/test/integration/practice-exercise.test.ts` (`ensurePracticeExercise`) | création unique par `(notion, version du cours)`, rejeu, notion inconnue, notion étrangère, version suivante | `test_engagement_jobs.py` + `test_engagement_jobs_domain.py` (contenu de la consigne) |

## Reste hors de cette tranche

Les définitions des automatismes (dont `jeu-lacune` et son exercice pratique) et le service de pause
ont été portés et prouvés par `512aeac2`, `8c68ca0c` et `8f85fcba` ; les trois opérations de décision
et les quatre opérations de pause sont basculées. Seul l'instantané HTML de React Email n'est pas
rejoué : les textes et les sujets le sont, la structure DOM diffère (consigné dans `parity.md`).

| Test TypeScript | Motif |
|---|---|
| `packages/notifications/src/email/render.ts` (instantané HTML) | l'instantané React Email n'est pas rejoué : les textes et les sujets le sont, la structure DOM diffère (consigné dans `parity.md`) |
