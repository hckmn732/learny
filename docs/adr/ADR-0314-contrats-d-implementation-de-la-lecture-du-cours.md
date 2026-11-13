# ADR-0314 — Contrats d'implémentation de la lecture du cours

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-609

## Contexte

SPEC-609 laisse ouverts le calcul exact du pourcentage, le lien entre section signalée et briques de quiz, et le repli quand le tuteur est indisponible.

## Décision

La progression est dérivée des sections visibles et fusionnée par maximum ; un signalement suspend les briques de banque partageant une notion avec la section et les réactive à la correction ; la correction du résumé utilise la tâche light avec une fixture mock et conserve le texte en brouillon si le tuteur échoue.

## Conséquences

Aucune brique n'est supprimée ; une tentative passée reste consultable. Le résumé reste lié à sa version de cours.
