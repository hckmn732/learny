# ADR-2009 — Environnement de preuve de la bascule : staging fourni par le porteur

- **Statut** : Acceptée
- **Origine** : Validée (décision du porteur du projet)
- **Date** : 2026-11-21
- **Liens** : ADR-0041, ADR-2007, SPEC-2301, SPEC-2302

## Contexte

La charge, le canary, le rollback et la restauration de sauvegarde ne se prouvent pas sur la seule machine de développement. Le porteur du projet fournira un environnement de staging hébergé.

## Décision

- Les mesures de charge, de canary, de rollback et de restauration de SPEC-2301/SPEC-2302 sont exécutées sur le staging Coolify fourni, avec une base Supabase de staging en région UE.
- Seuils : budgets d'ADR-0041 et BR-PLA-07 (API p95 < 300 ms hors appels IA) ; aucun autre seuil n'est inventé.
- Tant que le staging n'est pas disponible, les critères concernés sont consignés `node tools/sdd/fail.mjs SPEC-xxxx "staging indisponible" --external` ; tout le reste (local Docker, Supabase local) est prouvé et la preuve indique explicitement son environnement.
- Aucune mesure locale n'est présentée comme une mesure de staging.

## Conséquences

CP-23 ne peut passer qu'avec des preuves de staging réelles.
