# @learny/ingestion

Pipeline d'ingestion des apports (SPEC-509, SPEC-510).

- `chunkText` découpe un texte en passages d'environ 800 tokens avec 100 tokens de chevauchement,
  sur des limites de paragraphes, en conservant les offsets et la page.
- `extractNote` / `extractPdf` produisent un texte et des emplacements ; `unpdf` lit les PDF page
  par page et les erreurs (vide, chiffré, corrompu, trop long) sont typées.
- `fakeEmbedding` fournit un vecteur déterministe de 1024 dimensions en mode `LLM_MODE=mock` ;
  `voyageEmbeddingClient` appelle `voyage-4-lite` en mode réel, jamais en test.
- `processResource(ctx, resourceId)` verrouille l'apport, extrait, découpe, vectorise puis remplace
  les passages dans une transaction et émet `resource/ready` ou `resource/failed`.

Le paquet ne dépend ni de `@learny/services` ni de `@learny/jobs` : le job `ingest-resource` de
`@learny/jobs` et la démonstration SDD injectent les ports (lecture Storage, embeddings, fichiers
Anthropic, événements).
