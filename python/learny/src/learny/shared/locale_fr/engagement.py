"""User-facing French strings of the engagement context services (ADR-2011).

Every literal is copied verbatim from the reference implementation: the notification templates,
the e-mail subjects and bodies, the unsubscribe pages and the service messages.
"""

# one title/body per notification type and tone.
# The `vous` and `tu` variants are both copied: no `tu` variant may borrow a vouvoiement.

NOTIFICATION_MODULE_FALLBACK = "le module en cours"
NOTIFICATION_FORMATION_FALLBACK = "votre formation"

NOTIFICATION_TITLE_VALIDATION_SOON = {
    "vous": "Votre quiz de validation approche",
    "tu": "Ton quiz de validation approche",
}
NOTIFICATION_BODY_VALIDATION_SOON = {
    "vous": "« {module} » est planifié {when}. Prévoyez {minutes} minutes.",
    "tu": "« {module} » est planifié {when}. Compte {minutes} minutes.",
}

NOTIFICATION_TITLE_COURSE_READY = {
    "vous": "Votre cours est prêt",
    "tu": "Ton cours est prêt",
}
NOTIFICATION_BODY_COURSE_READY = {
    "vous": "Le cours de « {module} » est disponible. Vous pouvez le lire dès maintenant.",
    "tu": "Le cours de « {module} » est disponible. Tu peux le lire dès maintenant.",
}

NOTIFICATION_TITLE_GLOBAL_QUIZ_TODAY = {
    "vous": "Vos révisions du jour sont prêtes",
    "tu": "Tes révisions du jour sont prêtes",
}
NOTIFICATION_BODY_GLOBAL_QUIZ_TODAY = "{notions} notions à revoir, environ {minutes} minutes."

NOTIFICATION_TITLE_NEW_GAP = {
    "vous": "Une lacune a été détectée",
    "tu": "Une lacune a été repérée",
}
NOTIFICATION_BODY_NEW_GAP = "« {notion} » demande une révision dans « {formation} »."
NOTIFICATION_NOTION_FALLBACK = "une notion"

NOTIFICATION_TITLE_SESSION_PLANNED = {
    "vous": "Une séance a été planifiée",
    "tu": "Une séance est planifiée",
}
NOTIFICATION_BODY_SESSION_PLANNED = "« {title} » est prévue {when}."
NOTIFICATION_SESSION_FALLBACK = "Séance de travail"
NOTIFICATION_WHEN_FALLBACK = "prochainement"

NOTIFICATION_TITLE_MODULE_VALIDATED_POSITION = "Module {position} validé · {score} %"
NOTIFICATION_TITLE_MODULE_VALIDATED = "Module validé"
NOTIFICATION_BODY_MODULE_VALIDATED_NEXT = "Le module {position} · {title} est débloqué."
NOTIFICATION_BODY_MODULE_VALIDATED_LAST = {
    "vous": "Votre formation est terminée : découvrez votre bilan final.",
    "tu": "Ta formation est terminée : découvre ton bilan final.",
}
NOTIFICATION_BODY_MODULE_VALIDATED = {
    "vous": "« {module} » est validé. Votre progression est enregistrée.",
    "tu": "« {module} » est validé. Ta progression est enregistrée.",
}

NOTIFICATION_TITLE_SESSION_TO_RESCHEDULE = "Une séance à replacer"
NOTIFICATION_BODY_SESSION_TO_RESCHEDULE = {
    "vous": "« {title} » n’a pas eu lieu. Vous pouvez la replacer dans l’agenda.",
    "tu": "« {title} » n’a pas eu lieu. Tu peux la replacer dans l’agenda.",
}

NOTIFICATION_TITLE_WEEKLY_REVIEW = {
    "vous": "Votre bilan de la semaine",
    "tu": "Ton bilan de la semaine",
}
NOTIFICATION_BODY_WEEKLY_REVIEW = {
    "vous": "{study} d’étude. Retrouvez les points forts et les notions à consolider.",
    "tu": "{study} d’étude. Retrouve les points forts et les notions à consolider.",
}
NOTIFICATION_STUDY_FALLBACK = {"vous": "Votre semaine", "tu": "Ta semaine"}

NOTIFICATION_TITLE_MILESTONE = "Nouveau palier atteint"
NOTIFICATION_BODY_MILESTONE = {
    "vous": "{label} vient d’être atteint. Votre régularité porte ses fruits.",
    "tu": "{label} vient d’être atteint. Ta régularité porte ses fruits.",
}
NOTIFICATION_MILESTONE_FALLBACK = "Un palier"

NOTIFICATION_TITLE_AI_COST_ALERT = {
    "vous": "Votre plafond IA approche",
    "tu": "Ton plafond IA approche",
}
NOTIFICATION_BODY_AI_COST_ALERT = {
    "vous": "Vous avez utilisé {percent} % du plafond quotidien de l’IA fournie.",
    "tu": "Tu as utilisé {percent} % du plafond quotidien de l’IA fournie.",
}

NOTIFICATION_TITLE_AI_TASK_FAILED = "Une tâche IA a échoué"
NOTIFICATION_BODY_AI_TASK_FAILED = {
    "vous": "« {task} » n’a pas abouti. Vous pouvez la relancer.",
    "tu": "« {task} » n’a pas abouti. Tu peux la relancer.",
}
NOTIFICATION_TASK_FALLBACK = "Une tâche"

NOTIFICATION_TITLE_EXPORT_READY = {
    "vous": "Votre export est prêt",
    "tu": "Ton export est prêt",
}
NOTIFICATION_BODY_EXPORT_READY = {
    "vous": "L’archive de vos données est prête. Le lien reste valable {days} jours.",
    "tu": "L’archive de tes données est prête. Le lien reste valable {days} jours.",
}

NOTIFICATION_TITLE_GROUP_INVITATION = "Invitation à un groupe"
NOTIFICATION_BODY_GROUP_INVITATION = {
    "vous": "Vous êtes invité à rejoindre « {group} ».",
    "tu": "Tu es invité à rejoindre « {group} ».",
}
NOTIFICATION_GROUP_FALLBACK = "un groupe"

NOTIFICATION_TITLE_DAILY_DIGEST = {
    "vous": "Votre programme du jour",
    "tu": "Ton programme du jour",
}
NOTIFICATION_BODY_DAILY_DIGEST = "{count} activités prévues{planned}."

NOTIFICATION_TITLE_RELAUNCH = {
    "vous": "Reprenez votre formation",
    "tu": "Reprends ta formation",
}
NOTIFICATION_BODY_RELAUNCH = {
    "vous": "« {formation} » vous attend. Une courte séance suffit pour repartir.",
    "tu": "« {formation} » t’attend. Une courte séance suffit pour repartir.",
}

NOTIFICATION_TITLE_PLANNING_ADJUSTED = {
    "vous": "Votre planning a été ajusté",
    "tu": "Ton planning a été ajusté",
}
NOTIFICATION_BODY_PLANNING_ADJUSTED = {
    "vous": "Les séances de « {formation} » ont été réorganisées. Consultez l’agenda.",
    "tu": "Les séances de « {formation} » ont été réorganisées. Consulte l’agenda.",
}

NOTIFICATION_HREF_FALLBACK = "/notifications"
NOTIFICATION_HREF_FORMATION_FALLBACK = "/agenda"
NOTIFICATION_HREF_TODAY_FALLBACK = "/aujourdhui"
NOTIFICATION_HREF_SETTINGS_AI = "/reglages/ia"
NOTIFICATION_HREF_SETTINGS_DATA = "/reglages/donnees"
NOTIFICATION_HREF_GROUPS = "/groupes"

# deliveries.ts, digest.ts — service messages.
NOTIFY_INVALID = "Notification invalide."
NOTIFY_PROFILE_NOT_FOUND = "Profil introuvable."
DELIVERY_NOT_FOUND = "Livraison introuvable."
DELIVERY_EMAIL_TRANSIENT = "L’e-mail n’a pas pu être envoyé, nouvel essai possible."
DELIVERY_EMAIL_REJECTED = "L’adresse e-mail est refusée."
DELIVERY_PUSH_TOO_LARGE = "Notification push trop volumineuse."
DELIVERY_PUSH_INVALID = "Notification push invalide."
DIGEST_HELD_OTHERS = "{planned} et {count} autres dans l’agenda"
DIGEST_MINUTES = "{minutes} min"
DIGEST_HOURS = "{hours} h"
DIGEST_HOURS_MINUTES = "{hours} h {minutes}"
DIGEST_SLOT_LABELS: dict[str, str] = {
    "contributions": "Contributions",
    "course": "Cours",
    "exercise": "Exercice",
    "validation_quiz": "Quiz de validation",
    "global_quiz": "Quiz global",
    "revision": "Révision",
    "buffer": "Marge",
    "sprint": "Sprint",
    "mock_exam": "Examen blanc",
    "warmup": "Échauffement",
    "micro_session": "Micro-séance",
    "weekly_review": "Bilan de la semaine",
}

# SPEC-306.
INBOX_NOTIFICATION_NOT_FOUND = "Notification introuvable."

# SPEC-708.
SETTINGS_INVALID_BODY = "Les réglages envoyés sont invalides."
SETTINGS_INCONSISTENT = "Réglages de notifications incohérents."
SETTINGS_NOT_FOUND = "Réglages de notifications introuvables."
SETTINGS_PROFILE_NOT_FOUND = "Profil introuvable."
SETTINGS_CONFLICT = "Vos réglages ont été modifiés ailleurs. Rechargez-les puis réessayez."

# SPEC-204 EF-5.
UNSUBSCRIBE_TOKEN_INVALID = "Ce lien n’est plus valide."

# packages/i18n/src/fr/email.ts — the two unsubscribe HTML pages.
UNSUBSCRIBE_QUESTION = "Ne plus recevoir les e-mails de rappel de Learny ?"
UNSUBSCRIBE_KEEP = "Les e-mails liés à la sécurité de votre compte et à vos données continueront d’arriver."
UNSUBSCRIBE_CONFIRM = "Confirmer"
UNSUBSCRIBE_DONE_TITLE = "Désinscription prise en compte"
UNSUBSCRIBE_DONE = "C’est fait. Vous pouvez réactiver les e-mails dans Paramètres › Notifications."
UNSUBSCRIBE_INVALID_TITLE = "Lien invalide"
UNSUBSCRIBE_INVALID = "Ce lien n’est plus valide."
UNSUBSCRIBE_INVALID_HINT = "Vous pouvez gérer vos e-mails depuis Paramètres › Notifications."
UNSUBSCRIBE_PAGE_TITLE_SUFFIX = " · Learny"

# SPEC-205.
PUSH_UNAUTHENTICATED = "Vous devez être connecté pour effectuer cette action."
PUSH_FOREIGN_ENDPOINT = "Cet abonnement ne peut pas être enregistré sur ce compte."
PUSH_NOT_REGISTERED = "Abonnement non enregistré."
PUSH_LIVE_REFUSED_CI = "PUSH_MODE=live est refusé en intégration continue."
PUSH_NOT_CONFIGURED = "Le canal push n’est pas configuré (clés VAPID absentes)."
PUSH_ENDPOINT_INVALID = "un point de terminaison HTTPS public est attendu"

# The e-mail texts live in `engagement_email`: the templates, their subjects and the unsubscribe
# pages.

# the truncation mark of a clamped text.
NOTIFICATION_ELLIPSIS = "…"
NOTIFICATION_WHEN_SHORT = "bientôt"

# SPEC-706, BR-NOT-07.
REMINDER_INVALID = "Rappel invalide."
REMINDER_SLOT_MOVED = "Le cr\u00e9neau a \u00e9t\u00e9 d\u00e9plac\u00e9."
REMINDER_PROFILE_NOT_FOUND = "Profil introuvable."
TIMEZONE_INVALID = "Fuseau horaire IANA invalide."
REMINDER_TODAY = "aujourd\u2019hui \u00e0 {time}"
REMINDER_TOMORROW = "demain \u00e0 {time}"
REMINDER_OTHER = "le {date}"

# SPEC-613 ET-4.
PRACTICE_NOTION_INVALID = "Identifiant de notion invalide."
PRACTICE_NOTION_NOT_FOUND = "Notion introuvable."
PRACTICE_BRICK_NOT_CREATED = "Brique non cr\u00e9\u00e9e."
PRACTICE_VERSION_NOT_CREATED = "Version non cr\u00e9\u00e9e."
PRACTICE_ACTIVITY_NOT_CREATED = "Activit\u00e9 non cr\u00e9\u00e9e."
