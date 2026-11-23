# ADR-2039 — Constantes des tableaux de bord de migration mises à jour avec l inventaire

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : CP-21, CP-22, ADR-2008, ADR-2036, SPEC-113, SPEC-2001, SPEC-2207

## Contexte

ADR-2036 couvrait trois constantes seulement (59/59, 49, 190/217). Les pages de migration lisent des inventaires vivants : la base compte 60 tables toutes sous RLS forcée et 73 politiques, le service est passé à 7 tables ; api/inventory.json déclare 50 événements et 132 lacunes ; api/ownership.yaml déclare 201 opérations py sur 217 et 19 entrées encore relayées. Les assertions suivantes d'ADR-2036 ne passent plus sur une copie temporaire (catégorie service 7, toHaveCount(30), libellé « fabriques de » disparu), donc l'exception ne peut pas être invoquée en l'état.

## Décision

Décision du porteur : les constantes de ces trois tests de tableau de bord sont mises à jour vers les valeurs mesurées des inventaires générés (60/60, service 7 ; 50 événements, 132 lacunes ; 201/217, 19 entrées relayées) et les deux textes devenus faux de SPEC-2207 sont remplacés par un libellé encore présent. Aucune ligne de base visuelle n'est régénérée, aucune assertion de comportement (matrice RLS, parité, consommateurs, crons) n'est modifiée. Les spécifications SPEC-113, SPEC-2001 et SPEC-2207 portent un amendement daté citant cet ADR. Cette mise à jour remplace l'exception d'ADR-2036 pour ces trois tests ; elle devra être refaite après chaque étape de portage qui change l'inventaire.

## Conséquences

CP-21 et CP-22 peuvent être jugés sur des compteurs exacts. Les tests restent dépendants de l'inventaire : une nouvelle croissance légitime exigera la même mise à jour datée, ou la conversion en oracles dérivés des fichiers générés.
