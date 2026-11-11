# ADR-0044 — Export et suppression des données

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-211

## Contexte

RGPD et décision du porteur.

## Décision

Export : job Inngest qui produit un ZIP (cours en Markdown par module, apports originaux, `results.json`, `settings.json`, `conversations.json`) dans le bucket `exports`, lien signé valable 7 jours, e-mail. Suppression : `deletion_scheduled_for = now + 30 j`, connexion toujours possible pour annuler, cron nocturne qui supprime fichiers, données et compte Auth à échéance.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
