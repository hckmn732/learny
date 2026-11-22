"""Textes du tuteur vus par l'apprenant (SPEC-610, SPEC-2204).

Copies mot pour mot de `packages/services/src/tutor-chat/{context,conversations,sources,stream}.ts`
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
