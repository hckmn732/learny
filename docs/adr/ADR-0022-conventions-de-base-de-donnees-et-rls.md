# ADR-0022 — Conventions de base de données et RLS

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-113

## Contexte

Isolation des données par apprenant.

## Décision

Conventions de `docs/architecture/data-model.md`. Row Level Security activée sur toutes les tables du schéma `public` ; politiques par propriétaire et par appartenance de groupe ; rôle service réservé aux jobs. Tests d'isolation obligatoires pour chaque table.

## Conséquences

Un bug applicatif ne peut pas exposer les données d'un autre utilisateur.
