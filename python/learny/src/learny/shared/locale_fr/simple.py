"""User-facing French strings of simple mode (SPEC-4001 EF-6, EF-7; SPEC-4002 EF-4)."""

# SPEC-4002 EF-4 — notification in-app de fin d'analyse, texte exact de la maquette.
PROGRAMME_READY_NOTIFICATION_TITLE = "Ton programme est prêt"
PROGRAMME_READY_NOTIFICATION_BODY = (
    "Tes documents sont analysés : vérifie les modules, puis lance le diagnostic."
)

STEP_READ = "Lecture des documents"
STEP_STRUCTURE = "Détection des chapitres"
STEP_PRACTICE = "Exercices et sujets"
STEP_PROGRAMME = "Construction du programme"

STEP_READ_DETAIL = "Lecture du document de cours."
STEP_STRUCTURE_DETAIL = "Chapitres détectés dans le document."
STEP_PRACTICE_DETAIL = "Exercices rattachés aux chapitres."
STEP_PROGRAMME_DETAIL = "Programme proposé à partir du document."

STEP_READ_WAITING = "Lecture des documents en cours."
STEP_READ_TIMEOUT = "Les documents n’ont pas été lus à temps."
STEP_STRUCTURE_RUNNING = "Détection des chapitres en cours."
STEP_PRACTICE_FAILED = "Un document d’exercices n’a pas pu être lu."
STEP_PROGRAMME_RUNNING = "Construction du programme en cours."

STEP_LABELS = {
    "read": STEP_READ,
    "structure": STEP_STRUCTURE,
    "practice": STEP_PRACTICE,
    "programme": STEP_PROGRAMME,
}

SOURCE_ROLE_LABELS = {
    "course": "Cours",
    "exercises": "Exercices",
    "exam_papers": "Annales",
    "other": "Complément",
}

GENERATION_STATE_LABELS = {
    "acquired": "Acquis",
    "ready": "Prêt",
    "generating": "En cours",
    "queued": "En attente",
}

DEFAULT_TITLE = "Nouvelle formation"

SECTION_CHAPTER_TITLE = "{title} — partie {index}"
# Objectif d'un module quand le modèle ne propose pas de programme exploitable (QA 2026-11-26).
FALLBACK_OBJECTIVE = "Comprendre et savoir appliquer : {title}"
PRACTICE_DETAIL = "Exercices : {ready} document(s) rattaché(s), {failed} en échec."
CADRAGE_BEGINNER = "Débutant"
CADRAGE_MASTERY = "Maîtrise du contenu du document"
CADRAGE_SCOPE = "Document déposé"
VOLUME_LABEL = "{hours} heures"
DATES_LABEL = "Du {start} au {end}"
DIAGNOSTIC_STEM = "Quelle notion le module « {module} » retient-il ?"
