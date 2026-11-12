# ADR-0255 — Envois privés : réservations, idempotence sans URL stockée et suivi dans les métadonnées

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-206, SPEC-201, SPEC-104, SPEC-114, ADR-0039, ADR-0058, ADR-0120, ADR-0047

## Contexte

SPEC-206 doit réserver le quota avant l'envoi (ET-3), libérer une réservation expirée, garantir l'idempotence de la création (SPEC-201) et ne jamais stocker d'URL signée dans une colonne (ET-4). Le wrapper d'idempotence de SPEC-201 mémorise la réponse JSON 24 h dans idempotency_keys : y laisser l'URL d'envoi contredirait ET-4. La table resources n'a pas de colonne de réservation et les migrations sont figées après fusion.

## Décision

Le suivi d'envoi vit dans resources.metadata.upload (schéma strict resourceUploadSchema de packages/db, toutes clés facultatives) : taille et type annoncés, fin de fenêtre de réservation (horloge injectable, dix minutes comme la signature), clé d'idempotence, empreinte SHA-256 et etag mesurés, marqueurs d'événement et de retrait de blob ; size_bytes reste nul tant que l'envoi n'est pas finalisé, ce qui garde le trigger de SPEC-104 (quota et chapitre) cohérent. Le quota de 2 Go = octets finalisés + réservations vivantes ; une réservation expirée est supprimée logiquement (et son blob nettoyé) au prochain envoi du même apprenant, ce qui libère aussi sa place dans le décompte par chapitre appliqué par le trigger. Le service prend le même verrou consultatif par utilisateur que le trigger (espace 104) avant de compter. La route POST /chapters/:cid/uploads n'est donc pas marquée idempotent (le wrapper stockerait l'URL) : elle exige quand même l'en-tête Idempotency-Key, et le service retrouve la ressource par (utilisateur, clé) pour renvoyer le même resourceId avec une URL fraîche ; la même clé pour une autre requête renvoie IDEMPOTENCY_KEY_REUSED. Le client typé envoie une clé explicite même pour une route non marquée. Un chemin ne contient jamais de secret : seul <userId>/<resourceId>/<nom> est stocké.

## Conséquences

L'OpenAPI ne décrit pas l'en-tête Idempotency-Key de la route uploads.create (indiqué dans son résumé). Une migration dédiée (colonne de réservation) reste possible plus tard sans changer les contrats. Les ressources antérieures n'ont pas de clé upload : tout le code la traite comme absente.
