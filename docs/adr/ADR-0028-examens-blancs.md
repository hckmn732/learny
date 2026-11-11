# ADR-0028 — Examens blancs

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-614

## Contexte

Format officiel si connu.

## Décision

Le format (questions, durée, seuil) est extrait par le tuteur d'un apport `exam_guide` puis confirmé par l'apprenant ; à défaut : 20 questions, 2 min/question, seuil 70 %. Planification par défaut quand l'objectif `exam` existe : fin de l'avant-dernier module et dernier jour. Examen diagnostic possible à tout moment ; questions des modules non étudiés comptées à part. Soumission automatique à échéance, côté serveur (`deadline_at`).

## Conséquences

Le chronomètre de référence est côté serveur.
