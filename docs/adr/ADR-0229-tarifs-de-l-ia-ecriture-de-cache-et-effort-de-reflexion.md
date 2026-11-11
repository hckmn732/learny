# ADR-0229 — Tarifs de l'IA : écriture de cache et effort de réflexion

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-009, SPEC-507, ADR-0073

## Contexte

ADR-0073 fixe les tarifs d'entrée/sortie par million de tokens, la lecture de cache à 5 % de l'entrée et la réduction de 50 % en lot, mais ne précise pas le prix de l'écriture de cache exigé par docs/architecture/ai.md §1, ni comment stocker l'effort de réflexion par tâche.

## Décision

pricing.ts expose les tarifs d'entrée et de sortie par modèle en USD par million de tokens (Opus 5.5 4/20, Sonnet 5.5 2/10, Haiku 5.5 0,10/0,50) et en dérive la lecture de cache (5 % de l'entrée), l'écriture de cache (125 % de l'entrée, tarif standard Anthropic du cache 5 minutes) et les tarifs par lot (50 % de l'entrée et de la sortie). models.ts centralise les identifiants des modèles, la correspondance tâche vers modèle de BR-IA-01 et l'effort de réflexion de ai.md §1 (programme élevé, cours et lacunes moyen, tuteur faible, tâches légères aucun). Les valeurs restent des données de configuration à revérifier avant SPEC-808.

## Conséquences

Le calcul de coût (SPEC-507) dispose de toutes les composantes sans appel réseau. Un tarif modifié sans mise à jour de la règle ou d'un ADR fait échouer le test de correspondance de product.test.ts pour les valeurs BR ; les tarifs sont vérifiés par leurs propres assertions.
