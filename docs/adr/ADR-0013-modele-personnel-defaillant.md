# ADR-0013 — Modèle personnel défaillant

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-508, SPEC-506

## Contexte

Que faire si un modèle BYOK produit des briques invalides ?

## Décision

Après 2 corrections infructueuses, la tâche s'arrête (`INVALID_OUTPUT`), une notification `ai_task_failed` explique la situation ; l'utilisateur choisit un autre modèle de sa clé ou l'IA fournie (s'il est abonné). Jamais de bascule automatique vers l'IA payante.

## Conséquences

La tâche peut être relancée depuis la notification.
