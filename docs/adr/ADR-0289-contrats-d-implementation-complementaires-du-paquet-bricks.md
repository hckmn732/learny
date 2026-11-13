# ADR-0289 — Contrats d'implémentation complémentaires du paquet bricks

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-501

## Contexte

SPEC-501 fixe les schémas, la charge publique et l'empreinte, mais laisse trois détails d'implémentation ouverts : le paquet doit aussi tourner dans le navigateur pour la page de démonstration, le défaut de warnAtSec (300 s) peut dépasser une durée de minuteur plus courte, et les valeurs de contrôle sum_equal n'ont pas de borne de longueur.

## Décision

1. L'empreinte SHA-256 est implémentée localement (src/sha256.ts) plutôt que par node:crypto, afin que @learny/bricks reste isomorphe ; les tests la comparent aux vecteurs de node:crypto. 2. warnAtSec vaut min(300, durationSec) quand il est omis. 3. Une valeur de contrôle sum_equal est une chaîne de 1 à 80 caractères. 4. La charge publique conserve les sources citées, sauf pour le dialogue scénarisé dont la liste de champs d'ET-7 est exacte.

## Conséquences

Aucun import Node dans le paquet ; la page de démonstration valide côté client sans route supplémentaire. Les trois bornes sont testées dans les schémas.
