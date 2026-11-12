# ADR-0249 — Implémentation du stockage privé et des URL signées de dix minutes

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-114, SPEC-113, SPEC-206

## Contexte

SPEC-114 doit livrer deux buckets privés, des politiques Storage par propriétaire et des signatures de dix minutes. ADR-0058 fixe les buckets, le chemin et le TTL ; l'implémentation doit préciser la forme exacte des politiques, la vérification de la ligne DB, le rôle autorisé pour les exports, la normalisation des noms et le client Storage utilisable sans dépendance supplémentaire.

## Décision

Buckets privés storage.buckets resources et exports (public=false). Chemin <userId>/<uuid>/<nom> avec second segment UUID. Politiques storage.objects SELECT/INSERT/UPDATE/DELETE pour authenticated limitées à bucket_id et au premier segment égal à auth.uid()::text ; WITH CHECK identique pour interdire tout déplacement sous un autre préfixe ; aucune politique authenticated en écriture sur exports, réservés au rôle service_role du job. Toute signature de lecture exige la vérification préalable de la ligne resources (owner_id, deleted_at null) ou data_exports (user_id, statut done, non expiré) sous le client utilisateur. TTL exactement 600 s calculé par l'horloge injectable et transmis à l'API Storage REST via un client injectable ; les URL et jetons ne sont jamais journalisés. Noms normalisés en refusant ../, séparateurs, NUL, contrôles et séparateurs encodés. Suppression idempotente bornée au préfixe du propriétaire.

## Conséquences

SPEC-206 réutilise les helpers de chemin et de signature ; la validation MIME/taille/quota reste hors de cette spécification. Les tests d'intégration utilisent l'API Storage locale et des JWT utilisateurs réels, avec nettoyage explicite des objets créés hors transaction.
