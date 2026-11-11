# ADR-0056 — Embeddings et index vectoriel

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-509, SPEC-511

## Contexte

Coût minimal.

## Décision

Voyage AI `voyage-4-lite`, dimension 1024 (`EMBEDDING_DIM`), similarité cosinus, index HNSW pgvector. Mode `mock` : vecteurs déterministes dérivés d'un hachage du texte.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
