# ADR-0012 — Plafond quotidien de l'IA fournie

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-507

## Contexte

Maîtrise du coût par apprenant ; le porteur a choisi la bascule vers un modèle moins cher.

## Décision

Plafond par défaut 1,50 USD/jour/apprenant (`subscriptions.daily_cap_usd`, configurable par l'exploitant). Alerte à 80 %. Au plafond : bascule sur `claude-haiku-5-5` jusqu'à minuit (fuseau utilisateur) ; la conception de programme est reportée au lendemain. Le plafond ne s'applique pas aux clés personnelles.

## Conséquences

Le coût est estimé avant l'appel et constaté après (journal).
