# ADR-0241 — Numérotation concurrente des tentatives et versions de brique immuables

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-106, BR-BRI-06, ADR-0021

## Contexte

SPEC-106 CL-4 demande que deux créations concurrentes de tentative numéro N laissent une seule réussite et que l'autre relise le prochain numéro dans une transaction. Un verrou de ligne sur activities ne suffit pas lorsque les deux transactions lisent avant que la première ligne attempts soit visible. EF-2 et CL-1 exigent qu'une version de brique existante ne soit jamais réécrite.

## Décision

createAttempt prend un verrou consultatif transactionnel pg_advisory_xact_lock(hashtextextended(activity_id, 0)) puis un select ... for update sur l'activité, calcule max(attempt_no)+1 et insère avec on conflict (activity_id, user_id, attempt_no) do nothing returning ; si aucune ligne ne revient, il relit le maximum committé et réessaie jusqu'à cinq fois. La contrainte unique reste l'arbitre final. Un déclencheur brick_versions_immutable refuse toute mise à jour d'une ligne brick_versions (23514, brick_version_immutable) ; une nouvelle version est une nouvelle ligne, et addBrickVersion monte bricks.current_version sans jamais réécrire l'historique.

## Conséquences

Les deux tentatives concurrentes obtiennent les numéros 1 et 2 sans erreur visible pour l'apprenant ; la contrainte unique protège aussi un écrivain SQL direct. Corriger une brique exige une nouvelle version et un nouveau brickVersionId, ce qui préserve les réponses passées (BR-BRI-06).
