# ADR-0341 — Clés d'IA sans qualification bloquante et compatibilité par tâche

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-20
- **Liens** : SPEC-506, SPEC-709, ADR-0298, ADR-0328

## Contexte

L’ajout d’une clé ne doit plus exiger une batterie coûteuse de quatre étapes et treize briques. Les affectations de modèle doivent rester immédiates, tout en signalant de façon non bloquante les capacités insuffisantes de la combinaison clé/modèle/tâche. La découverte doit limiter les choix aux modèles de chat et les diagnostics fournisseur rester sûrs.

## Décision

À l’ajout, le serveur découvre uniquement les modèles de chat puis exécute exactement un test de connexion sur un modèle de chat. La qualification globale ne bloque plus une affectation. Pour chaque triple credential/model/task, le serveur vérifie uniquement les capacités exigées par TASK_CONFIG avec sondes strictes d’outils, sortie structurée et image, persiste le résultat horodaté, réutilise ce résultat et permet une revérification. Les réserves STRUCTURED_UNRELIABLE, NO_VISION et NO_TOOLS sont informatives et leurs messages français sont affichés ; l’affectation reste toujours acceptée. Les anciens rapports failed restent tolérés. Les sorties générées de briques conservent leur validation et leurs corrections existantes. CONTEXT_TOO_LONG reconnaît uniquement des marqueurs explicites et les journaux ne gardent que la classe du fournisseur et un extrait court et assaini de son message.

## Conséquences

SPEC-506 et SPEC-709 changent de contrat normatif : modèles connectés à l’ajout, compatibilité pending/compatible/reserve par tâche, absence de 422 AI_MODEL_NOT_QUALIFIED lors d’une affectation. Les contrats et l’OpenAPI sont additifs ; aucune affectation automatique ou bascule vers un modèle fourni n’est introduite. Les réserves sont actionnables mais non bloquantes.
