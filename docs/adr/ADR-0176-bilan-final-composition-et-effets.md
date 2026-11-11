# ADR-0176 — Bilan final : composition et effets du choix

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-617, SPEC-603, SPEC-612

## Contexte

ADR-0015 définit l'entretien léger et l'arrêt. Il faut fixer les indicateurs du bilan, l'état avant le choix et les effets concrets.

## Décision

1. À `formation/completed` : `formations.status='completed'`, `completed_at`, `maintenance_mode` reste NULL (choix non fait) ; notification « Votre bilan final est prêt » (type `milestone`) vers `/formations/[fid]/bilan`. Tant que le choix n'est pas fait, le comportement est celui de l'entretien léger.
2. Indicateurs : résultat final = moyenne des meilleurs scores de validation (`module_progress.best_score`) arrondie ; acquis = notions de maîtrise ≥ 80 % sans lacune ouverte ; notions fragiles = maîtrise < 80 % ou lacune ouverte (10 au plus affichées, maîtrise croissante) ; heures = somme des durées des créneaux `done` de la formation, arrondie à l'heure ; durée = semaines entières entre `start_date` et `completed_at` (minimum 1) ; rétention à 1 et 2 mois (SPEC-408), « Pas encore mesurée » si la fenêtre est vide.
3. Entretien léger (`light`) : quiz global de la formation plafonné à 5 min/jour, notions dues uniquement ; seuls l'automatisme 7 et le programme du jour restent actifs ; un créneau quotidien `global_quiz` de 5 min est planifié sur les jours d'étude.
4. Arrêt (`stopped`) : `notion_states.in_review = false` pour la formation, créneaux futurs annulés, aucune notification ni automatisme pour cette formation ; « Réviser » reste possible (session volontaire des notions dues).
5. Le choix est modifiable à tout moment depuis le bilan ; passer de `stopped` à `light` remet `in_review = true` sur les notions déjà vues.
6. Une formation terminée ne compte pas dans la limite de trois formations actives.

## Conséquences

L'onglet « Terminées » de l'accueil (SPEC-603) lit `maintenance_mode` pour afficher « n notions aujourd'hui · entretien de mémoire » ou « Entretien arrêté ».
