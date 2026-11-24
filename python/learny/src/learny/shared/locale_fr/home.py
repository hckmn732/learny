"""User-facing French strings of the home screen (SPEC-603, ADR-2011).

Every literal is copied verbatim from the reference implementation. Codes reference the constant,
never an inline French string.
"""

# packages/domain/src/home/derive.ts `OBJECTIVE_LABELS` (EF-6).
OBJECTIVE_LABELS: dict[str, str] = {
    "operational": "Être opérationnel",
    "exam": "Certification",
    "dialogue": "Dialoguer avec des experts",
    "project": "Livrer un projet",
}

# `MODULE_STATUS_LABELS` (EF-6): the activity pill of the open module.
MODULE_STATUS_CONTRIBUTIONS: tuple[str, str] = ("Apports en cours", "green")
MODULE_STATUS_PREPARING: tuple[str, str] = ("Cours en préparation", "indigo")
MODULE_STATUS_READING: tuple[str, str] = ("Cours à lire", "violet")
MODULE_STATUS_TO_TAKE: tuple[str, str] = ("Quiz à passer", "indigo")
MODULE_STATUS_TO_RETAKE: tuple[str, str] = ("Quiz à repasser", "orange")

# `SLOT_LABELS` (ET-5): the twelve kinds of schedule slots of the day card.
HOME_SLOT_LABELS: dict[str, str] = {
    "contributions": "Apports",
    "course": "Cours",
    "exercise": "Exercice",
    "validation_quiz": "Quiz de validation",
    "global_quiz": "Quiz global",
    "revision": "Révision",
    "sprint": "Sprint",
    "micro_session": "Micro-séance",
    "warmup": "Échauffement",
    "mock_exam": "Examen blanc",
    "buffer": "Marge de rattrapage",
    "weekly_review": "Bilan",
}

# `objectiveText` joins the labels of a formation with a middle dot.
OBJECTIVE_SEPARATOR = " · "

# `formatDuration` (EF-2).
DURATION_MINUTES = "{minutes} min"
DURATION_HOURS = "{hours} h"
DURATION_HOURS_MINUTES = "{hours} h {rest}"

# `nextActivityLabel` and `nextActivityDetail` (EF-6).
NEXT_ACTIVITY_TODAY = "Aujourd'hui, {time}"
NEXT_ACTIVITY_TOMORROW = "Demain, {time}"
NEXT_ACTIVITY_DATED = "{date}, {time}"
NEXT_ACTIVITY_CHAPTER = "{label}, chapitre {chapter}"

# `completedSummary` (EF-7) and the ellipsis of a one-line description.
ELLIPSIS = "…"

# `primaryActionFor` (ET-4).
PRIMARY_START_VALIDATION_QUIZ = "Commencer le quiz de validation"
PRIMARY_RESUME_COURSE = "Reprendre le cours"
PRIMARY_SUBMIT_CONTRIBUTIONS = "Déposer mes apports"
PRIMARY_DO_EXERCISE = "Faire l'exercice"
PRIMARY_REVIEW_NOW = "Réviser maintenant"
PRIMARY_START_MOCK_EXAM = "Commencer l'examen blanc"

# `slotHref` (EF-2): the pill link of a warm-up.
SLOT_ANCHOR_WARMUP = "#echauffement"

# the action of a formation card.
ACTION_RESUME = "Reprendre"
ACTION_CONTINUE = "Continuer"
ACTION_REVIEW = "Réviser"
ACTION_VIEW_REPORT = "Voir le bilan"

# The next activity of a formation that has no slot yet (EF-6).
NEXT_PROGRAMME_VALIDATE = "Valider le programme"
NEXT_PROGRAMME_ONE_MODULE = "1 module proposé"
NEXT_PROGRAMME_MODULES = "{count} modules proposés"
NEXT_CADRAGE_FINISH = "Terminer le cadrage"
NEXT_CADRAGE_QUESTION = "Question {number} sur 5 au plus"
