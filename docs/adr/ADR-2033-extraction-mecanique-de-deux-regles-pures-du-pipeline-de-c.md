# ADR-2033 — Extraction mécanique de deux règles pures du pipeline de cours pour l'oracle

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2207, SPEC-608, ADR-2008, ADR-2026

## Contexte

Le portage Python de `tutor.generate_course` (SPEC-2207) exige un oracle `tsx` sur la partie pure de
`packages/tutor/src/course/generate.ts` : le choix des passages dans le budget de contexte de la
tâche `course` (24 000 jetons) et l'ordre canonique des extrémités d'un lien de notions. Or ces deux
règles n'existent pas sous forme de fonction exportée : la première est une boucle écrite en ligne
dans `readModuleContext` (qui ouvre une transaction, donc inatteignable depuis un script d'oracle) ;
la seconde est une expression ternaire écrite en ligne dans `insertNotionLinks`. Sans exposition, un
oracle devrait réimplémenter ces règles, ce qu'ADR-2008 et ADR-2026 interdisent (l'oracle doit
enregistrer le comportement réel, jamais une copie qui dérive).

## Décision

Deux extractions strictement mécaniques, plus l'ajout du mot-clé `export` sur quinze déclarations
déjà existantes du même module (`SECTION_KIND`, `MEDIA_KIND`, `locationOf`, `toKnownChunk`,
`asRecord`, `uuidArray`, `errorMessage`, `retryable`, `scenarioFor`, `assertDraftBelongsToChapter`,
`sectionAnchor`, `dataOf`, `contentOf`, `mediaOf`, `citationsOf`, `documentsOf`) :

1. **`selectChapterDocuments(chunks)`** — la boucle de sélection est déplacée telle quelle ; le site
   d'appel lui passe exactement l'expression d'origine (`byChapter.get(chapter.id) ?? []`) et
   reconstruit `allowedChunkIds` à partir des documents retournés, dont le `chunkId` est toujours
   celui du passage retenu : mêmes identifiants, dans le même ordre.
2. **`notionLinkEnds(link)`** — l'expression ternaire est déplacée telle quelle, appelée avec le
   même objet `link` au même endroit.

La preuve de l'identité mécanique est jointe au commit : sur les dix-neuf lignes déplacées, la seule
différence après normalisation de l'indentation est l'en-tête de boucle (`chunk of chunks` au lieu de
`chunk of byChapter.get(chapter.id) ?? []`), l'accolade fermante de la boucle suit le déplacement, et
l'appel reçoit l'expression d'origine. Le type du paramètre de `scenarioFor` est restreint à
`Pick<CourseGenerationContext, 'deps'>` et `Pick<ChapterSnapshot, 'id' | 'passages'>` : un
élargissement des entrées acceptées, sans effet à l'exécution (les types sont effacés).

## Conséquences

`packages/tutor` reste du code de production vivant jusqu'à SPEC-2302 : les deux fonctions extraites
gardent exactement le comportement précédent, prouvé par `vitest run --project unit packages/tutor`
(36/36 verts), `tsc -p packages/tutor/tsconfig.json --noEmit`, `tsc -p tsconfig.tools.json --noEmit`,
`eslint --max-warnings=0` et `prettier --check` verts. L'oracle `tools/oracles/course-vectors.mts`
enregistre le comportement réel et le fixture `api/oracles/vectors/course.json` est rejoué par
`packages-py/learny/tests/unit/tutor/test_tutor_course_domain.py`. Les deux fonctions disparaissent
avec le paquet TypeScript à SPEC-2302, en même temps que l'oracle.
