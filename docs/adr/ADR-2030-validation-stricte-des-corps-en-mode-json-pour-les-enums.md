# ADR-2030 — Validation stricte des corps en mode JSON pour les enums

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2204, SPEC-2201, ADR-2012

## Contexte

Le pipeline validait les corps avec model_validate(strict=True). Pydantic refuse alors la valeur texte d'un StrEnum (is_instance_of), alors que Zod accepte la chaine et seulement elle. Toute operation dont le corps porte un enum etait refusee en 422 a travers la facade : les sept operations me.ai de SPEC-2204, et deja me.ai.task-models.update porte par SPEC-2201.

## Décision

Valider un corps depuis sa forme JSON (model_validate_json(strict=True)) et laisser les path et query en mode objet : le mode JSON de Pydantic accepte la valeur texte d'un enum tout en refusant toujours un nombre envoye comme chaine. Aucun contrat, aucun oracle et aucun libelle ne changent.

## Conséquences

Deux cas ajoutes a test_validate.py (enum accepte, valeur inconnue refusee) et un cas existant (nombre en chaine refuse en strict) qui reste vert. Le defaut etait latent depuis SPEC-2201 ; les operations concernees ne sont pas toutes couvertes par les e2e, d'ou la decouverte ici.
