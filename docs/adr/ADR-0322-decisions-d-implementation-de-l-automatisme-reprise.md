# ADR-0322 — Décisions d’implémentation de l’automatisme reprise

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-14
- **Liens** : SPEC-712, SPEC-711, SPEC-705, SPEC-407, ADR-0190, ADR-0192

## Contexte

SPEC-712 s’appuie sur le moteur de SPEC-711, le planificateur de SPEC-407 et un contrat ADR-0190 qui interdit tout effet de bord dans run. Or ADR-0192 §1 exige que le tick de 22 h marque les séances manquées, la délégation de l’option de planning appartient à SPEC-705 encore non livrée, le bandeau doit survivre à un aller-retour vers l’agenda, et le jeu de démonstration ne contient aucune séance manquée dans la semaine visible.

## Décision

1) reprise.run marque missed les créneaux échus des formations actives à 22 h : c’est la règle d’agenda d’ADR-0192 §1, aucune proposition n’est appliquée depuis run. 2) Le moteur gagne trois extensions rétrocompatibles : data dans AutomationNotificationDraft, reproposeAfterUndo et recalcul du summary après accord, refus et annulation. 3) L’option de planning est enregistrée avec le choix explicite et aucun créneau n’est modifié tant que le service de SPEC-705 n’est pas livré. 4) Le bandeau conserve l’action acceptée dans sessionStorage pour survivre à la navigation. 5) La séance manquée du seed est créée par le test e2e hors de la semaine visible, et la marge du vendredi est libérée le temps du test puis restaurée.

## Conséquences

Les tests d’intégration exécutent runAutomation directement, les textes du bandeau restent ceux de la maquette, et le branchement au service de replanification de SPEC-705 reste le seul complément attendu.
