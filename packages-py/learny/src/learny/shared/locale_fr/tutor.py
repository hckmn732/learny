"""Textes du tuteur vus par l'apprenant (SPEC-610, SPEC-2204).

Copies mot pour mot de `packages/services/src/tutor-chat/{context,conversations,sources,stream,self-test}.ts`
et `packages/tutor/src/chat/prompt.ts`. La typographie francaise (apostrophe courbe, guillemets) est
normative : ce module est le seul endroit ou ces libelles vivent (ADR-2011).
"""

APOSTROPHE = "\N{RIGHT SINGLE QUOTATION MARK}"

CONTEXT_LABELS: dict[str, str] = {
    "formation": "Formation",
    "chapter": "Cours en lecture",
    "passage": "Passage",
    "resources": "Vos apports",
    "gap": "Lacune suivie",
    "profile": "Votre profil",
}

FORMATION_OBJECTIVES: dict[str, str] = {
    "operational": "être opérationnel",
    "exam": "préparer la certification",
    "dialogue": "pouvoir en parler",
    "project": "conduire un projet",
}

GAP_NATURES: dict[str, str] = {
    "forgetting": "s’efface avec le temps",
    "confusion": "confondue avec une notion proche",
    "misunderstanding": "comprise de travers",
    "application": "pas encore appliquée",
}

NO_INFORMATION = "Aucune information disponible"
NO_RESOURCE_VALUE = "Aucun apport : le tuteur s’appuie sur le cours"
PASSAGE_SELECTED = "Passage sélectionné"
DONT_CONFUSE = "Ne pas confondre"
TUTOR_COMPLETED = "Complété par le tuteur"

FORMATION_VALUE = "{title} · {objectives}"
CHAPTER_VALUE = "Module {module} · Chapitre {chapter} · {title} · {percent} % lu"
PASSAGE_VALUE = "« {text} »"
GAP_VALUE = "{label} · {nature} · maîtrise {mastery} %"
GAP_CONFUSED = "confondue avec {other}"
GAP_NATURE_CONFUSED_TEXT = "se confond encore avec {other}"

GREETING_PASSAGE = "Vous lisez « {passage} ». Je pars de ce passage, de {resources} et du reste du chapitre."
GREETING_PASSAGE_ALONE = "Vous lisez « {passage} ». Je pars de ce passage et du reste du chapitre."
GREETING_RESOURCES = "Je connais ce chapitre, {resources} ({titles}) et votre objectif."
GREETING_PLAIN = "Je connais ce chapitre et votre objectif."
GREETING_GAP = "Vos quiz montrent que {label} {nature} : j’y ferai attention."
GREETING_QUESTION = "Que voulez-vous que je vous explique ?"
RESOURCE_SINGULAR = "votre apport"
RESOURCE_PLURAL = "vos {count} apports"

FOLLOW_UP_LABELS: dict[str, str] = {
    "rephrase": "Explique autrement",
    "example": "Un exemple concret",
    "test_me": "Teste-moi",
}
COMPARE_LABEL = "{left} ou {right} ?"

SOURCE_TYPE_SUFFIX = r"\s*\((?:PDF|DOCX?|TXT|MD|MARKDOWN|AUDIO|VIDÉO|VIDEO|WEB|HTML)\)\s*$"
SOURCE_PDF_PAGE = "{title}, p. {page}"
SOURCE_AUDIO = "votre {title}, {time}"
SOURCE_COURSE = "Votre cours, chapitre {position}"
TUTOR_SOURCE_UNKNOWN = "Complété par le tuteur · à confirmer dans vos sources"
TUTOR_SOURCE_KNOWN = "Complété par le tuteur · à confirmer dans {title}"

STREAM_ANSWER_FAILED = "La réponse n’a pas pu être obtenue."
SUMMARY_LEARNER = "Apprenant"
SUMMARY_TUTOR = "Tuteur"

# `packages/services/src/tutor-chat/conversations.ts` and `stream.ts` (SPEC-610 ET-3).
CONVERSATION_NOT_FOUND = "Discussion introuvable."
COURSE_NOT_FOUND = "Cours introuvable."
MESSAGE_NOT_SAVED = "Message non enregistré."
ANSWER_NOT_SAVED = "Réponse non enregistrée."
STREAM_IN_PROGRESS = "Une réponse est déjà en cours sur cette discussion."
SELF_TEST_PENDING = "Répondez d’abord à la question Teste-moi en attente."

# `packages/services/src/tutor-chat/self-test.ts` (SPEC-610 ET-7).
NO_NOTION_TO_TEST = "Aucune notion à tester dans ce chapitre."
NO_QUESTION_ASKED = "Le tuteur n’a pas posé de question."
NO_PENDING_SELF_TEST = "Aucune question Teste-moi n’est en attente."
DEFAULT_NOTION_LABEL = "cette notion"
SELF_TEST_CONTENT = "Une question, sans regarder le cours :\n\n{question}"
CORRECTION_NOT_SAVED = "Correction non enregistrée."
ACTIVITY_NOT_CREATED = "Activité non créée."
ACTIVITY_NOT_FOUND = "Activité introuvable."
ACTIVITY_NOT_READY = "Une tentative exige une activité prête."
ATTEMPT_NOT_CREATED = "Numéro de tentative introuvable."
BRICK_NOT_CREATED = "Brique non créée."
BRICK_VERSION_MISSING = "Version de brique absente."
SELF_TEST_GRADE_DESCRIPTION = "Verdict borné d’une réponse à un Teste-moi (ADR-0174)."
SELF_TEST_OK = "Je note la réussite : la notion « {label} » passe de {before} % à {after} % de maîtrise."
SELF_TEST_QUIZ_TOMORROW = "Je remets cette notion dans votre quiz global de demain."
SELF_TEST_QUIZ_TONIGHT = "Je remets cette notion dans votre quiz global de ce soir, à {time}."
TOMORROW = "demain"
QUIZ_DEFAULT_TIME = "17:00"
OPEN_QUESTION_EXPECTED = "L’idée essentielle de {label}"
OPEN_QUESTION_CRITERION = "Idée essentielle de {label}"
OPEN_QUESTION_MODEL_ANSWER = "Une réponse juste mobilise {label} et l’explique dans le contexte du chapitre."
OPEN_QUESTION_EXPLANATION = "La question vérifie la compréhension de {label}, sans récitation."
OPEN_QUESTION_OBJECTIVE = "Vérifier {label}"
