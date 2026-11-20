# ADR-0328 — Contrats et comportements de l'onglet Modèles d'IA

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-14
- **Liens** : SPEC-709, SPEC-504, SPEC-506, ADR-0154, ADR-0013, ADR-0341

## Contexte

SPEC-709 devait trancher quatre points non explicités : le sens de la pastille « Hors UE » pour l'IA fournie, l'exclusion stricte des modèles échoués des sélecteurs alors que la maquette les montre désactivés, la sémantique du retour aux modèles par défaut et l'absence de bascule payante quand un modèle personnel devient non qualifié (CL-3) face au comportement historique de resolveModel (SPEC-504).

## Décision

1. L'IA fournie (Anthropic) n'affiche ni pastille ni avertissement hors UE : ADR-0154 point 4 la déclare dans la liste des sous-traitants (SPEC-806) ; seules les clés personnelles portent la pastille et la phrase exacte « Traite les données hors de l'Union européenne ». 2. Un modèle échoué ou non qualifié est totalement absent des cinq sélecteurs, conformément à CA-1 ; la maquette qui le montre désactivé est une illustration, la règle métier prime. 3. Choisir le modèle fourni par défaut d'une tâche supprime la ligne ai_task_models correspondante ; choisir un autre modèle fourni ou personnel crée une ligne (credential_id nul pour le fourni). « Revenir aux modèles par défaut » supprime toutes les lignes de l'apprenant sans toucher aux clés ni à leur qualification. 4. resolveModel refuse la tâche avec AI_UNAVAILABLE dès qu'une ligne personnelle existe mais que sa clé ou son modèle n'est plus qualifié, même avec un abonnement actif : aucune bascule automatique vers l'IA payante (BR-IA-05, CL-3). Le cas abonné + clé non qualifiée de SPEC-504 est aligné sur cette règle. 5. PATCH /me/ai/models est idempotent (upsert sur user_id, task) et porte une clé d'idempotence ; le serveur revalide la qualification et la propriété, une clé étrangère répond 404 sans révéler son existence.

## Amendement ADR-0341

Les points 2 et 5 ne constituent plus une qualification bloquante. Le serveur accepte toute
affectation vers un modèle déclaré par une clé possédée. Il vérifie ensuite, sans rejeter le PATCH,
les capacités exigées par la tâche et rend un état `pending`, `compatible` ou `reserve`. Un ancien
rapport `failed` reste visible et n'exclut plus le modèle. Le point 4 est amendé dans le même sens :
la résolution tolère ces réserves et ne rejette que l'absence réelle de clé ou de modèle. La
propriété, l'idempotence, le 404 d'une clé étrangère et l'absence de bascule payante demeurent
obligatoires.

## Conséquences

La maquette et l'application diffèrent uniquement par l'absence des options non qualifiées dans un select fermé ; les tests visuels comparent le bandeau, la liste des tâches et les cartes fournisseurs. Aucune clé, aucun rapport brut et aucune donnée d'un autre apprenant ne franchissent le DTO.
