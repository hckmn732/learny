# `@learny/bricks`

Contrat unique des treize types de briques (SPEC-501, BR-BRI-01 à BR-BRI-07, ADR-0150, ADR-0151).

- `registry.ts` — les treize types, leurs schémas Zod normatifs, leurs règles internes, leurs
  références et leur charge publique.
- `validate.ts` — `validateBrick` (schéma, règles internes, règles communes, références) et
  `parseBrickPayload`.
- `fingerprint.ts` — normalisation ADR-0151 et empreinte SHA-256 des sept types « question ».
- `types/<type>/{schema,checks,public,examples}.ts` — un dossier par type, avec au moins un exemple
  valide et un exemple invalide réutilisés par les tests, la qualification (SPEC-506) et la galerie
  (SPEC-503).

Le paquet est pur et isomorphe : aucun accès à la base, aucune horloge, aucun aléa système. Le
mélange de la charge publique est déterministe (graine = identifiant de version) et l'empreinte est
calculée par une implémentation SHA-256 locale, utilisable aussi dans le navigateur (ADR-0289).
