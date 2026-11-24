# ADR-4008 — Mode simple : noms d'événements pointés et tâche simple_analysis hors sélecteur

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-24
- **Liens** : SPEC-4001, ADR-4003, ADR-2014

## Contexte

SPEC-4001 nomme ses deux événements d'outbox simple.analysis.requested et simple.generation.requested (EF-5, EF-7, EF-9, ET-4) alors que la convention du dépôt, enforced par enqueue_event et par les tests du worker, n'autorisait que des segments séparés par une barre oblique. Par ailleurs la tâche ai_task simple_analysis doit exister pour l'analyse, mais le sélecteur de modèles à cinq tâches (AI_MODELS_TASK_IDS, écran Paramètres) est du périmètre de SPEC-4002.

## Décision

Les noms pointés de SPEC-4001 sont conservés : la fonction enqueue_event accepte désormais des segments séparés par / ou par . (migration 0059_simple_mode_events), les tests du registre de consommateurs acceptent explicitement les deux formes. La tâche simple_analysis est ajoutée à l'enum ai_task, au catalogue TASK_CONFIG et aux fixtures du mock, mais pas aux cinq tâches proposées par le sélecteur de modèles : SPEC-4002 et SPEC-4003 ajoutent la sixième ligne, sans migration.

## Conséquences

Le backend et le contrat sont complets et testés (AI_NOT_CONFIGURED liste la tâche manquante) ; tant que SPEC-4002 n'est pas livrée, aucun écran ne permet de choisir un modèle pour simple_analysis, ce qui est la dette assumée de la phase P40. Aucun autre nom d'événement existant n'est modifié.
