# SPEC-209 — table de décision des livraisons

Générée depuis `packages/notifications/src/routing.ts` et vérifiée par `[SPEC-209] décision de livraison`. Ordre normatif (ADR-0214) : préférence de canal/type → péremption (`stale`) → `eligibleAt` → week-end → heures calmes → plafond → envoi.

| Canal / condition | Statut | `scheduledFor` |
|---|---|---|
| `channel_email = false` ou `channel_push = false` | `skipped_pref` | — |
| Interrupteur du type désactivé (`type_revision`, `type_validation`, `type_course`, `type_gap`, `type_planning`, `type_relaunch`) | `skipped_pref` | — |
| Notification lue ou `staleAt <= now` | `skipped_pref` (`error = stale`) | — |
| `eligibleAt > now` | `scheduled` | `eligibleAt` |
| Samedi/dimanche local, `weekend_quiet = true`, type ≠ `global_quiz_today` | `deferred_quiet` | lundi local, fin des heures calmes |
| Instant dans `[quiet_start, quiet_end)` | `deferred_quiet` | `nextOutsideQuietHours(now)` |
| `quiet_start = quiet_end` | — (pas d’heures calmes) | envoi selon les autres contrôles |
| `sentToday >= max_per_day` (3, 5 ou 8), type ≠ `daily_digest` | `capped` | — |
| Type `daily_digest` (hors plafond, e-mail uniquement) | `sent` | — |
| Tous les contrôles passés | `sent` (journalisé `scheduled` immédiat dans la transaction) | — |

Correspondance type → interrupteur : `global_quiz_today → type_revision` ; `validation_soon`, `module_validated → type_validation` ; `course_ready → type_course` ; `new_gap → type_gap` ; `session_planned`, `session_to_reschedule`, `planning_adjusted → type_planning` ; `relaunch → type_relaunch` ; les autres types ne dépendent que du canal.

Canaux (ADR-0265) : `daily_digest → [email]`, `export_ready → [push]`, les autres types → `[email, push]`.
