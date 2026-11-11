# ADR-0142 — Détection d'oubli par FSRS et nature par défaut des lacunes

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-404, SPEC-411

## Contexte

BR-LAC-02 limite les déclencheurs de lacune aux tentatives de quiz de validation, d'examen et d'exercice, ou à l'erreur répétée ; BR-LAC-03 définit pourtant l'oubli comme « signalé par FSRS », et la maquette `Lacunes.dc.html` montre une lacune d'oubli révélée par le quiz global du 10 novembre. Par ailleurs, une notion sous le seuil peut ne présenter aucun des signes de BR-LAC-03 : il faut une nature par défaut.

## Décision

1. Déclencheur supplémentaire : lors d'une revue de source `global_quiz`, `micro_session`, `warmup`, `sprint`, `self_test` ou `offline`, si la revue est un **trou de mémoire FSRS** (carte à l'état `review` avant la revue, note `again`) et que la maîtrise après revue est sous le seuil, la notion devient une lacune (nature oubli, sauf nature plus prioritaire détectée).
2. Une notion qui entre en lacune sans aucun signe de nature reçoit : **oubli** si elle a déjà été réussie au moins une fois avant l'échec déclencheur, sinon **incompréhension**.
3. « Même erreur » : signature `confusion:<notionId>` (le distracteur choisi ou l'élément mal associé représente cette autre notion) ou `text:<réponse normalisée>` (minuscules, sans accents, espaces réduits) ; elle doit apparaître dans deux tentatives distinctes.
4. Levée : deux réussites postérieures à la détection dont les dates locales diffèrent d'au moins un jour, et maîtrise ≥ seuil.

## Conséquences

Proposition de correction de BR-LAC-02 : ajouter « ou si FSRS signale un oubli lors d'une révision et que la maîtrise est sous le seuil ».
