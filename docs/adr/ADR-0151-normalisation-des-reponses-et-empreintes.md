# ADR-0151 — Normalisation des réponses et empreintes

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-501, SPEC-502, SPEC-513

## Contexte

BR-BRI-07 (empreinte = SHA-256 de l'énoncé normalisé et de la bonne réponse), BR-MEM-05 (comparaison insensible à la casse et aux accents) et ADR-0024 (même réponse normalisée) exigent une normalisation unique et reproductible.

## Décision

Fonction `normalizeText(s)` de `packages/bricks/src/normalize.ts`, appliquée dans cet ordre : (1) `s.normalize('NFKC')` ; (2) remplacement des apostrophes et guillemets typographiques (`’ ‘ ‛ ʼ « » “ ” „`) par leur équivalent ASCII (`'` ou `"`), des tirets `– — ‑` par `-`, de l'espace insécable et de l'espace fine par une espace ; (3) `toLowerCase()` ; (4) `normalize('NFD')` puis suppression des marques diacritiques (`\p{M}`), puis `normalize('NFC')` ; (5) réduction de toute suite de blancs à une espace ; (6) `trim()` ; (7) suppression de la ponctuation finale `[.?!:;…]+$` puis nouveau `trim()`. Le résultat est idempotent.

Empreinte : `sha256(utf8(normalizeText(stem) + "␟" + canonicalAnswer))` en hexadécimal minuscule (64 caractères), `canonicalAnswer` étant défini par type dans SPEC-501 (réponses triées puis jointes par `|`). Seuls les sept types « question » ont une empreinte : `choice_question`, `open_question`, `cloze`, `matching`, `ordering`, `categorization`, `recall_card`.

## Conséquences

La même fonction sert à la correction des textes à trous, à la détection de « même erreur » (SPEC-404) et à la déduplication des banques (SPEC-513).
