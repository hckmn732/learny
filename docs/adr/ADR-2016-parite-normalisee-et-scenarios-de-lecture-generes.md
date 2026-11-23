# ADR-2016 — Parite normalisee et scenarios de lecture generes

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-21
- **Liens** : SPEC-2001

## Contexte

SPEC-2001 exige des oracles rejouables a l identique contre le TypeScript (CA-3, CL-2). Les reponses du backend contiennent des valeurs non deterministes (identifiants, horodatages, e-mails de session, durees mesurees, plans EXPLAIN) et 141 operations n ont aucun test existant.

## Décision

Le harnais tools/parity compare statiquement la reponse mais normalise explicitement les valeurs non deterministes (UUID, ISO, e-mails, durees, plans EXPLAIN) et genere un scenario de succes par operation de lecture sans parametre de chemin (64 operations), les mutations etant ecrites a la main. Toute operation sans test ni oracle reste signalee CL-1 dans l inventaire.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
