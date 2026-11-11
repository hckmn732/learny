# ADR-0145 — Gabarit journalier du planificateur

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-407, SPEC-605, SPEC-704, SPEC-705, SPEC-719

## Contexte

ADR-0029 décrit un glouton mais pas les durées, les horaires, ni ce qui consomme la capacité quotidienne ; la maquette `Agenda.dc.html` montre un planning régulier (apports le matin, cours l'après-midi, quiz et marge le dernier jour du module, quiz global à 17:00, sprints à 16:30).

## Décision

1. Fenêtres de placement par moment préféré : matin 09:00–12:00, après-midi 14:00–17:00, soir 18:30–21:00. La « traîne de révision » d'une journée dure 60 min à partir de la fin du dernier moment préféré (17:00–18:00 si l'après-midi est choisi).
2. La capacité `hoursPerDay` (cumulée toutes formations) couvre les activités de programme : apports, cours, révision de module, quiz de validation, examen blanc, marge. Le quiz global (30 min), les sprints (30 min), échauffements et micro-séances sont des révisions hors capacité : quiz global dans la traîne ; sprint au dernier créneau libre de 30 min se terminant au début de la traîne, sinon dans la traîne.
3. Fenêtre d'un module = jours d'étude `plannedStart`..`plannedEnd`, calculée à la validation du programme par `planModuleWindows` (ceil(heures du module × 60 / minutes quotidiennes) jours d'étude consécutifs). Journée ordinaire d'un module : bloc d'apports = 60 % de la capacité arrondi à 30 min, puis bloc de cours (reste) ; dernier jour : apports (capacité − 120 min − durée d'examen éventuelle, arrondi à 30 min inférieur), quiz de validation 60 min, marge 60 min, examen blanc éventuel. Chaque activité est placée au premier créneau libre de la journée, sans être coupée entre deux moments.
4. Examens blancs (objectif `exam`) : dernier jour de l'avant-dernier module et dernier jour de la formation ; durée = questions × minutes par question (défaut 20 × 2 = 40 min).
5. Sprints : J-K et J-1 calendaires avant chaque quiz de validation futur, ramenés au jour d'étude précédent s'il le faut, jamais avant le début de la fenêtre du module ni avant l'horizon ; un seul sprint par formation et par jour.
6. Quiz global : chaque jour d'étude de la formation sauf le premier.
7. Le planificateur est sans état : il recalcule l'ensemble des créneaux futurs, chacun portant une clé déterministe pour le rapprochement avec la base.

## Conséquences

Le scénario SAP de référence (2 nov. → 11 déc. 2026) est figé dans les tests de SPEC-407. Les écarts avec la maquette (titres complets des modules, chapitres regroupés quand un module a moins de jours que de chapitres, examens blancs) sont assumés : la spécification prime sur la maquette.
