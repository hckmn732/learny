# ADR-0179 — Mes lacunes : indicateurs et entraînement ciblé

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-615, SPEC-701, SPEC-613

## Contexte

La maquette `Lacunes.dc.html` affiche « 4 notions à consolider », « 23 notions maîtrisées », « 17:00 prochaine révision » et des liens « S'entraîner » vers le quiz global ou l'exercice, sans règle de calcul.

## Décision

1. Lacune affichée = `notion_states` de l'apprenant pour la formation avec `gap_nature IS NOT NULL AND gap_cleared_at IS NULL`. Tri : nature (confusion, misunderstanding, application, forgetting, ordre de la maquette) puis maîtrise croissante.
2. Notions maîtrisées = maîtrise ≥ 80 % sans lacune ouverte. Les sous-titres citent les positions de modules concernées : « dans les modules 2 et 3 », « dans les modules 1 à 3 » si elles sont contiguës et au nombre de 3 ou plus, « dans le module 3 » si une seule.
3. Prochaine révision = heure du prochain créneau `global_quiz` `planned` de la formation aujourd'hui (« 17:00 ») ; sinon date courte du prochain (« jeu. 12 nov. ») ; sinon « — ».
4. « S'entraîner » : nature `application` → dernier exercice ciblé non réussi de la notion (`/formations/[fid]/modules/[mid]/exercices/[aid]`), à défaut le quiz global ciblé ; autres natures → `/formations/[fid]/quiz-global?focus=[notionId]`. Le bouton d'en-tête « S'entraîner sur mes lacunes » → `/formations/[fid]/quiz-global?focus=lacunes`. La prise en charge de `focus` par `GET /formations/:fid/global-quiz/today` (session ciblée hors plafond, comptée pour FSRS) relève de SPEC-701.
5. « Revoir dans le cours » → `/formations/[fid]/modules/[mid]/cours?chapitre=[cid]#[anchor]`, ancre de la première section du cours courant dont `notion_ids` contient la notion.

## Conséquences

Tant que SPEC-701 n'accepte pas `focus`, le lien ouvre la session du jour (lacunes en tête), ce qui reste conforme à BR-LAC-05.
