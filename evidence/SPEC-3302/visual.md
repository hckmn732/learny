# SPEC-3302 — conformité visuelle

Comparaison automatique de la capture du flux `SPEC-3302 lecture` avec la maquette de référence
(`design/app-mobile/exports/screens/android-04-cours.png`, état « chapitre 2, haut de page »),
selon ADR-3003 § 4 et ADR-3019.

- **Masque** : `apps/mobile/e2e/visual/masks/spec-3302-lecture.json` — barre d'état (2,5 % du haut)
  et indicateur d'accueil (2 % du bas), en ratios. Aucune zone de contenu n'est masquée : la
  maquette comporte une barre d'état, la comparaison est donc **applicable** (ADR-3019 ne
  s'applique pas).
- **Ligne de base versionnée** : `apps/mobile/e2e/visual/baselines/SPEC-3302-lecture.png`,
  copie octet pour octet de l'export de la maquette.
- **Seuil** : écart de pixels ≤ 12 % (ADR-3003 § 4).

## Mesures

| Comparaison | Écart | Résultat |
|---|---|---|
| Capture vs `android-04-cours.png` (maquette), campagne officielle | **7,27 %** (824 × 1830) | ✅ ≤ 12 % |
| Re-mesure du même jour avec `compare.mjs` | 8,10 % | ✅ ≤ 12 % |

Rapport et image de différence : `evidence/SPEC-3302/visual/comparaison-maquette.txt` et
`evidence/SPEC-3302/visual/diff-maquette-android-04-cours.png`.

## Ce qui explique l'écart restant

1. **Contenu du jeu de démonstration** : le chapitre 2 du cours généré (SPEC-115) contient une
   section « Présentation », une question éclair, un bloc « Ne pas confondre » et « À retenir » ;
   la maquette dessine un cours rédigé (en-tête de pièce, cartes de champ). La comparaison porte
   donc sur la mise en page, les jetons et le chrome, pas sur le texte du corps.
2. **Barre de lecture** : la maquette est dessinée à 50 % ; l'état de démonstration du chapitre 2
   est à 100 % (chapitre lu, CA-2).
3. **Signet** : absent (ADR-3003 § 2), comme prévu par la spécification § 10.

## Contrôles structurels (en complément du pixel)

- Jetons : barre de lecture citron (`theme.colors.lime`), titre en grande taille
  (`theme.type.largeTitle`), étiquette module indigo en capitales — test
  `test/cours/course-screen.test.tsx` « applique les jetons de la maquette au chrome de l'écran ».
- Structure : `course-header`, `course-badge` (« Chapitre 2 sur 4 »), `course-progress`,
  `course-module-tag`, `course-title`, `course-meta`, `course-article`, `course-toc`,
  `course-ask-tutor`, `course-open-quiz` — testID de la spécification § 10, vérifiés par les tests
  de composants et par le flux Maestro.
- Ordre des régions : en-tête (retour, badge, sommaire) → barre de lecture → article (étiquette,
  titre, méta, sections) → barre inférieure (tuteur, quiz), comme la maquette.
