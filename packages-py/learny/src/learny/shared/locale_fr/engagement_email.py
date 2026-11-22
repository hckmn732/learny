# packages/notifications/emails/*.tsx et src/templates/email-props.ts — textes des gabarits e-mail,
# copiés au mot près. Ce module est la seule source des libellés du canal e-mail.
CTA_LABEL = "Ouvrir"
DATE_TODAY = "aujourd’hui"
WEEK_THIS = "cette semaine"
STUDY_ZERO = "0 h"
SUCCEEDED_DEFAULT = "Vos acquis progressent."
AT_RISK_DEFAULT = "Aucune notion à risque."
NEXT_WEEK_DEFAULT = "La prochaine semaine est planifiée."
TASK_FALLBACK = "Une tâche IA"
MODEL_FALLBACK = "modèle personnel"

WELCOME_SUBJECT = "Bienvenue sur Learny"
WELCOME_GREETING = "Bienvenue !"
WELCOME_GREETING_NAMED = "Bienvenue, {first_name} !"
WELCOME_PREVIEW = {
    "vous": "Votre compte est prêt : deux minutes de réglages avec le tuteur.",
    "tu": "Ton compte est prêt : deux minutes de réglages avec le tuteur.",
}
WELCOME_INTRO = {
    "vous": (
        "Votre compte est prêt. Le tuteur vous attend pour quelques réglages : votre profil, "
        "votre rythme et votre IA. Comptez deux minutes."
    ),
    "tu": (
        "Ton compte est prêt. Le tuteur t’attend pour quelques réglages : ton profil, ton rythme "
        "et ton IA. Compte deux minutes."
    ),
}
WELCOME_BULLET_COURSES = {
    "vous": "Des cours construits à partir de vos propres ressources, sources citées",
    "tu": "Des cours construits à partir de tes propres ressources, sources citées",
}
WELCOME_BULLET_REVIEWS = "Des révisions espacées pour ne pas oublier"
WELCOME_BULLET_KEY = {
    "vous": "Gratuit avec votre propre clé d’IA",
    "tu": "Gratuit avec ta propre clé d’IA",
}
WELCOME_CTA = "Continuer mes premiers pas"
WELCOME_CTA_PATH = "/premiers-pas/profil"

REMINDER_CTA_DEFAULT = "Ouvrir dans Learny"

AI_TASK_FAILED_SUBJECT = "Le tuteur n’a pas pu terminer : {task_label}"
AI_TASK_FAILED_PREVIEW = {
    "vous": "La tâche est arrêtée, rien n’a été modifié. Choisissez un autre modèle.",
    "tu": "La tâche est arrêtée, rien n’a été modifié. Choisis un autre modèle.",
}
AI_TASK_FAILED_INTRO = {
    "vous": (
        "Le modèle {model} de votre clé a produit un contenu invalide deux fois de suite pour "
        "« {subject} ». La tâche est arrêtée, rien n’a été modifié."
    ),
    "tu": (
        "Le modèle {model} de ta clé a produit un contenu invalide deux fois de suite pour "
        "« {subject} ». La tâche est arrêtée, rien n’a été modifié."
    ),
}
AI_TASK_FAILED_SECOND = {
    "vous": "Choisissez un autre modèle de votre clé.",
    "tu": "Choisis un autre modèle de ta clé.",
}
AI_TASK_FAILED_CTA = "Choisir un modèle"
AI_TASK_FAILED_CTA_PATH = "/parametres#modeles"

WEEKLY_REVIEW_SUBJECT = {
    "vous": "Votre bilan de la semaine du {start} au {end}",
    "tu": "Ton bilan de la semaine du {start} au {end}",
}
WEEKLY_REVIEW_TITLE = {
    "vous": "Votre bilan du {start} au {end}",
    "tu": "Ton bilan du {start} au {end}",
}
WEEKLY_REVIEW_PREVIEW = "{study} d’étude, {at_risk} notions à risque."
WEEKLY_REVIEW_STUDY = "{study} d’étude"
WEEKLY_REVIEW_RETENTION = "{percent} % retenu à 1 mois"
WEEKLY_REVIEW_RETENTION_EMPTY = "— % retenu à 1 mois"
WEEKLY_REVIEW_AT_RISK = "{count} notions à risque"
WEEKLY_REVIEW_SUCCEEDED = "Réussi : {succeeded}"
WEEKLY_REVIEW_AT_RISK_LINE = {
    "vous": "À risque d’oubli : {at_risk}. Ils passent dans vos prochains quiz globaux.",
    "tu": "À risque d’oubli : {at_risk}. Ils passent dans tes prochains quiz globaux.",
}
WEEKLY_REVIEW_NEXT_WEEK = "Cette semaine : {next_week}"
WEEKLY_REVIEW_QUESTION = {
    "vous": "Vos disponibilités changent-elles ?",
    "tu": "Tes disponibilités changent-elles ?",
}
WEEKLY_REVIEW_CTA = "Voir le bilan"
WEEKLY_REVIEW_SECONDARY_CTA = "Mes disponibilités changent"
WEEKLY_REVIEW_CTA_PATH = "/accueil"
WEEKLY_REVIEW_SECONDARY_PATH = "/parametres#profil"

DIGEST_SUBJECT = {
    "vous": "Votre programme du {date}",
    "tu": "Ton programme du {date}",
}
DIGEST_GREETING = "Bonjour,"
DIGEST_GREETING_NAMED = "Bonjour {first_name},"
DIGEST_PREVIEW_MANY = {
    "vous": "{count} activités, {planned} prévues.",
    "tu": "{count} activités, {planned} prévues.",
}
DIGEST_PREVIEW_EMPTY = "Aucune activité prévue aujourd’hui."
DIGEST_EMPTY_TEXT = {
    "vous": ("Aucune activité prévue aujourd’hui. Un quiz global de 5 minutes garde vos notions au chaud."),
    "tu": ("Aucune activité prévue aujourd’hui. Un quiz global de 5 minutes garde tes notions au chaud."),
}
DIGEST_INTRO = {
    "vous": ("Voici vos {count} activités du jour, toutes formations confondues : {planned} prévues."),
    "tu": "Voici tes {count} activités du jour, toutes formations confondues : {planned} prévues.",
}
DIGEST_GLOBAL_QUIZ = "Quiz global : {notions} notions à revoir, environ {minutes} min."
DIGEST_HELD_TITLE = "En attente dans l’application"
DIGEST_HELD_INTRO = {
    "vous": (
        "{count} notification(s) n’ont pas été envoyée(s) hier pour respecter votre limite de "
        "{max_per_day} par jour :"
    ),
    "tu": (
        "{count} notification(s) n’ont pas été envoyée(s) hier pour respecter ta limite de "
        "{max_per_day} par jour :"
    ),
}
DIGEST_HELD_LINK = "Ouvrir les notifications"
DIGEST_HELD_PATH = "/accueil?notifications=ouvertes"
DIGEST_CTA = "Ouvrir ma journée"
DIGEST_CTA_PATH = "/accueil"

EMAIL_PREFERENCES_PATH = "/parametres#notifications"
EMAIL_PREFERENCES_LINK = "Gérer mes notifications"
EMAIL_UNSUBSCRIBE_LINK_SERVICE = "Se désabonner des e-mails"
EMAIL_FOOTER = {
    "vous": "Vous recevez cet e-mail parce que vous avez un compte Learny.",
    "tu": "Tu reçois cet e-mail parce que tu as un compte Learny.",
}

# packages/notifications/src/email/{config,transports}*.ts — service messages of the channel.
LINK_SECRET_REQUIRED = "Configuration e-mail invalide : EMAIL_LINK_SECRET est obligatoire."
RESEND_KEY_REQUIRED = "Configuration e-mail invalide : EMAIL_MODE=resend exige RESEND_API_KEY."
SMTP_FAILED = "Envoi SMTP impossible."
RESEND_UNAVAILABLE = "Resend indisponible."
RESEND_REFUSED = "Resend a refusé le message."
ACTIVITY_TIME_FALLBACK = "00:00"
ACTIVITY_TITLE_FALLBACK = "Activité"
TOKEN_INVALID_USER = "Identifiant utilisateur invalide pour le jeton."

# packages/notifications/emails/{deletion-scheduled,deletion-completed,export-ready}.tsx - the
# transactional e-mails of SPEC-211, ported by SPEC-2206. Two tones, no unsubscribe link (ADR-0032).
DELETION_SCHEDULED_SUBJECT = {
    "vous": "Suppression de votre compte programmée le {scheduledLabel}",
    "tu": "Suppression de ton compte programmée le {scheduledLabel}",
}
DELETION_SCHEDULED_PREVIEW = {
    "vous": "Effective le {scheduledLabel} ; annulable à tout moment en vous reconnectant.",
    "tu": "Effective le {scheduledLabel} ; annulable à tout moment en te reconnectant.",
}
DELETION_SCHEDULED_BODY = {
    "vous": (
        "Vous avez demandé la suppression de votre compte. Elle sera effective le "
        "{scheduledLabel} : formations, apports, cours, résultats et réglages seront alors "
        "effacés définitivement."
    ),
    "tu": (
        "Tu as demandé la suppression de ton compte. Elle sera effective le {scheduledLabel} : "
        "formations, apports, cours, résultats et réglages seront alors effacés définitivement."
    ),
}
DELETION_SCHEDULED_CANCEL = {
    "vous": "D’ici là, vous pouvez l’annuler à tout moment : il suffit de vous reconnecter.",
    "tu": "D’ici là, tu peux l’annuler à tout moment : il suffit de te reconnecter.",
}
DELETION_SCHEDULED_CTA = "Annuler la suppression"
DELETION_SCHEDULED_EXPORT_CTA = "Exporter mes données"
PROFILE_PATH = "/parametres#profil"

DELETION_COMPLETED_SUBJECT = {
    "vous": "Votre compte Learny a été supprimé",
    "tu": "Ton compte Learny a été supprimé",
}
DELETION_COMPLETED_PREVIEW = "Merci d’avoir appris avec Learny."
DELETION_COMPLETED_BODY = {
    "vous": (
        "Comme demandé le {requestedLabel}, votre compte et toutes vos données ont été supprimés "
        "définitivement aujourd’hui. Merci d’avoir appris avec Learny."
    ),
    "tu": (
        "Comme demandé le {requestedLabel}, ton compte et toutes tes données ont été supprimés "
        "définitivement aujourd’hui. Merci d’avoir appris avec Learny."
    ),
}

EXPORT_READY_SUBJECT = {
    "vous": "Votre export Learny est prêt",
    "tu": "Ton export Learny est prêt",
}
EXPORT_READY_PREVIEW = "Archive de {sizeLabel}, lien valable 7 jours."
EXPORT_READY_BODY = {
    "vous": (
        "Votre archive ({sizeLabel}) est prête. Le lien de téléchargement est valable 7 jours, "
        "jusqu’au {expiresLabel}."
    ),
    "tu": (
        "Ton archive ({sizeLabel}) est prête. Le lien de téléchargement est valable 7 jours, "
        "jusqu’au {expiresLabel}."
    ),
}
EXPORT_READY_CTA = "Télécharger mes données"
EXPORT_READY_PRIVATE = {
    "vous": "Ce lien est personnel : ne le transférez pas.",
    "tu": "Ce lien est personnel : ne le transfère pas.",
}

# `templates/email/*.j2` - the labels shared by the three transactional templates.
EMAIL_TRANSACTIONAL_CATEGORY = "transactional"
