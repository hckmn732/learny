# ADR-0214 — Routage unifie des notifications et report des envois

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-209

## Contexte

BR-NOT-03 a BR-NOT-06, ADR-0031, ADR-0123 et ADR-0124 fixent canaux, plafond, heures calmes et categories, mais pas l'ordre des controles, la correspondance entre types et interrupteurs de preferences, la regle du week-end ni la forme du resume des envois ecartes.

## Décision

notify(sctx, { userId, type, formationId?, data, dedupeKey?, eligibleAt?, staleAt? }) cree d'abord la notification in-app (toujours, sans plafond), dedupliquee par unique(user_id, dedupe_key) ; une notification deja existante ne recree aucune livraison. Pour chaque canal externe (email, push), controles dans cet ordre, chacun produisant une ligne notification_deliveries : 1) canal desactive ou type desactive -> skipped_pref ; 2) week-end local avec weekend_quiet=true et type autre que global_quiz_today (revisions dues) -> deferred_quiet jusqu'au lundi local, a la fin des heures calmes ; 3) heures calmes -> deferred_quiet avec scheduled_for = nextOutsideQuietHours ; 4) plafond max_per_day atteint pour le jour local -> capped ; 5) sinon sent ou failed. Correspondance type -> interrupteur : global_quiz_today -> type_revision ; validation_soon, module_validated -> type_validation ; course_ready -> type_course ; new_gap -> type_gap ; session_planned, session_to_reschedule, planning_adjusted -> type_planning ; relaunch -> type_relaunch ; weekly_review, milestone, ai_cost_alert, ai_task_failed, export_ready, group_invitation, daily_digest -> toujours actifs. Le plafond compte les livraisons sent du jour local, e-mail et push confondus ; une meme notification envoyee sur les deux canaux compte une fois. daily_digest ne compte pas dans le plafond et n'est soumis qu'a channel_email. Une livraison reportee est reevaluee a son echeance par le job notifications/deferred-due ; si staleAt est depasse ou la notification deja lue, elle passe skipped_pref avec error = stale. Les livraisons capped de la veille locale sont resumees dans le bloc held du programme du jour (au plus 10 titres). Les textes sont produits par des gabarits par type avec variantes vous/tu (ADR-0010).

## Conséquences

SPEC-706 et les automatismes appellent uniquement notify ; aucun producteur n'ecrit directement dans notification_deliveries.
