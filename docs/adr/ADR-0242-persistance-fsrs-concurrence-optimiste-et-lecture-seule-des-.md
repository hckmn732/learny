# ADR-0242 — Persistance FSRS, concurrence optimiste et lecture seule des journaux

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-107, ADR-0022, ADR-0025, ADR-0112, ADR-0149

## Contexte

SPEC-107 doit stocker la carte ts-fsrs sérialisée, garantir qu'une réponse concurrente n'écrase jamais une révision appliquée (ET-5, CL-3) et activer la RLS dès la migration (ET-4). Le modèle de données §6 ne nomme pas de jeton de version ; ADR-0112 déclare review_logs et gap_events en lecture seule pour l'utilisateur ; ET-2 énumère elapsed_days, champ supprimé par ts-fsrs 6.0.0.

## Décision

notion_states reçoit une colonne revision (entier, défaut 0) comme jeton de concurrence optimiste : applyReview verrouille la ligne (select ... for update), compare la révision attendue puis incrémente, et renvoie CONFLICT sur une révision périmée ; detectGap et clearGap suivent la même règle. notion_states porte created_at/updated_at et le déclencheur set_updated_at (ADR-0022) ; review_logs et gap_events n'ont qu'une politique de lecture propriétaire, les écritures passant par le rôle service (ADR-0112 §4). Un déclencheur refuse toute mise à jour du journal, sauf la mise à null de answer_id par la clé étrangère on delete set null (CL-5) ; les événements de lacune sont aussi non réécrits. gap_confused_with est une FK vers notions en on delete set null, limitée à la nature confusion par une contrainte et vérifiée dans la même formation par un déclencheur. La carte FSRS est validée par Zod et normalisée en ISO UTC avant écriture ; le paquet @learny/db n'exécute aucun calcul FSRS. ts-fsrs est figé en 5.4.2 car ET-2 nomme elapsed_days, retiré en 6.0.0 ; le passage à 6 fera l'objet d'un ADR lors de SPEC-402.

## Conséquences

Deux réponses simultanées sur la même notion obtiennent une réussite et un CONFLICT explicite rejouable, sans retour en arrière de due_at ; l'historique reste append-only et lisible par son seul propriétaire, tandis que les services autorisés écrivent sous le rôle propriétaire. La migration 0014_memory est complétée par 0015_memory_rules (RLS, déclencheurs, index partiel déjà généré).
