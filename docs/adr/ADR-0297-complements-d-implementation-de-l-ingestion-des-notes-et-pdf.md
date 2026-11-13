# ADR-0297 — Compléments d'implémentation de l'ingestion des notes et PDF

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-509, ADR-0056, ADR-0057, ADR-0047, ADR-0048

## Contexte

SPEC-509 demande un paquet `@learny/ingestion`, un service `processResource`, un job événementiel, un découpage avec chevauchement, des embeddings Voyage simulés, des statuts et une reprise idempotente. Le référentiel fixe les contrats, les tables et les ADR de principes, mais laisse ouvertes plusieurs décisions d'implémentation : où vivent les ports, comment prouver qu'un événement a déjà été traité, comment découper entre deux pages, et comment envoyer un PDF à l'API Files sans dépendre de `@learny/services`.

## Décision

1. Le paquet `@learny/ingestion` ne dépend ni de `@learny/services` ni de `@learny/jobs` ; le job `ingest-resource` dépend de lui et injecte les ports (lecture Storage, embeddings, envoi Anthropic Files, événements). Les dépendances restent ainsi acycliques.
2. Le suivi de traitement vit dans `resources.metadata.ingestion` : `contentHash`, `completedAt`, `chunkCount`, `embeddingModel`, `embeddingDim` et les marques de réclamation/émission des événements `resource/ready` et `resource/failed`. Aucun contenu d'apport n'y est recopié.
3. Un run commence par passer la ressource en `processing`, puis les étapes durables extraient, découpent, vectorisent et finalisent. La finalisation verrouille la ligne, remplace tous les passages dans une seule transaction et n'écrit qu'après le succès complet. Un run sur une ressource déjà `ready` avec le même `contentHash` ne rappelle pas le fournisseur d'embeddings.
4. Le découpage est effectué par emplacement source : une page de PDF n'est jamais mélangée à une autre, les passages restent des sous-chaînes exactes du texte extrait et le chevauchement reprend des paragraphes entiers, au moins le dernier lorsque le budget de 100 tokens est plus petit que lui.
5. En mode `mock`, l'embedding est dérivé de blocs SHA-256 comme `fakeEmbedding` de `@learny/db/testing`, ce qui garantit les mêmes vecteurs dans les tests de SPEC-104, SPEC-509 et SPEC-511. En mode `live`, `voyage-4-lite` est appelé côté serveur ; une panne 429/5xx reste transitoire et laisse la ressource `processing`, une clé refusée est permanente.
6. L'envoi du PDF à l'API Files Anthropic n'est tenté que pour l'IA fournie (`managed`). Une clé Anthropic personnelle exigerait le déchiffrement de SPEC-505, hors périmètre de l'ingestion ; l'absence d'envoi ne bloque pas les passages extraits.
7. Les échecs permanents portent un code stable (`PDF_EMPTY_TEXT`, `PDF_CORRUPTED`, `PDF_ENCRYPTED`, `PDF_TOO_LARGE`, `PDF_TOO_MANY_PAGES`, `NOTE_EMPTY`, `NOTE_TOO_LARGE`, `RESOURCE_FILE_MISSING`, `EXTRACTION_FAILED`, `EMBEDDING_INVALID`, `EMBEDDING_KEY_INVALID`) et un message affichable ; `EMBEDDING_UNAVAILABLE` est transitoire.
8. La démonstration SDD exécute les vrais extracteurs et le vrai service dans une transaction annulée (`withRollback`) avec les ports simulés ; elle ne rend ni clé, ni contenu privé, ni identifiant de fournisseur réel.

## Conséquences

Le schéma `resourceMetadataSchema` accepte la clé facultative `ingestion` et les codes ci-dessus rejoignent le catalogue d'erreurs. SPEC-510 réutilise `extract`/`chunkText`/`processResource` et fournit seulement ses extracteurs. SPEC-607 pourra exposer le bouton « Réessayer » en remettant la ressource en file, le service acceptant déjà un nouvel essai sur une ressource `failed`.
