# ADR-0144 — Composition et lissage de la session de quiz global

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-406, SPEC-701, SPEC-703, SPEC-716, SPEC-718

## Contexte

BR-AUT-07 plafonne la durée quotidienne sans dire comment estimer la durée d'une notion ; la maquette `QuizGlobal.dc.html` montre « 18 notions dues, 4 reportées à jeudi pour rester sous 15 min », une micro-séance « 5 notions en 5 minutes » et des jeux portant sur plusieurs notions.

## Décision

1. Plafond : coût = 60 s fixes par session + 60 s par notion retenue ; les notions sont retenues par priorité tant que le coût reste ≤ au plafond (15 min → 14 notions). Micro-séance : 60 s par notion, sans coût fixe (5 min → 5 notions). Entretien léger (ADR-0015) : plafond de 5 min.
2. Éligibles : notions `in_review`, non suspendues, dont l'échéance précède le début du jour local suivant et non revues le jour même. Priorité : lacunes (confusion > application > incompréhension > oubli, puis maîtrise croissante), puis rétrievabilité croissante, échéance, identifiant. Les notions non retenues sont reportées au prochain jour d'étude.
3. Format : confusion → association (classement si l'association a été le dernier format) avec la notion confondue ; oubli → carte de rappel ; application → question à choix et suggestion d'exercice ; incompréhension → question à choix ; sinon selon la préférence (varier, plutôt cartes, plutôt association et classement). Jamais deux fois de suite le même format pour une notion si un autre format est disponible (BR-MEM-04).
4. Regroupement en jeux : cartes de rappel consécutives par paquets de 5 au plus ; associations et classements par groupes de 2 à 4 notions ; autres formats : une notion par jeu. Entrelacement des modules à l'intérieur du groupe des lacunes puis du groupe des autres notions.
5. Durée affichée = somme des durées par format (carte de rappel 30 s, question à choix 45 s, texte à trous 45 s, remise en ordre 60 s, association et classement 40 s par notion), arrondie à la minute la plus proche (minimum 1).

## Conséquences

Le créneau d'agenda du quiz global reste de 30 min (ADR-0029), indépendamment de la durée estimée de la session.
