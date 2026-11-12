# ADR-0234 — Coexistence de la migration d'amorçage 0000 et du miroir préfixé

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-101, ADR-0111

## Contexte

SPEC-008 a livré et fusionné supabase/migrations/0000_extensions.sql, qui crée déjà les quatre extensions. ADR-0111 impose que les migrations Drizzle soient copiées sous le préfixe 2026111100NNNN. Deux fichiers pouvaient donc créer les mêmes objets, et db:check ne devait pas considérer l'amorçage comme un orphelin.

## Décision

La migration d'amorçage 0000_extensions.sql est conservée telle quelle, jamais modifiée ni supprimée (immuabilité des migrations fusionnées) ; elle s'applique avant les fichiers 2026111100NNNN. La migration 20261111000000_extensions_and_shared.sql répète les extensions en create extension if not exists, ce qui est idempotent. Le script check-migrations.mjs ne gouverne que les fichiers 2026111100* : un fichier 0000 hors préfixe est laissé intact, un fichier 2026111100* sans source est un orphelin.

## Conséquences

L'ordre d'application reste 0000 puis 0000 des migrations Drizzle ; un reset depuis une base vide passe. Les spécifications suivantes n'ajoutent que des numéros supérieurs à 0001 dans packages/db/migrations.
