# ADR-0147 — Série : journée en cours et jalons uniques

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-409, SPEC-723

## Contexte

ADR-0033 fixe le parcours en arrière ; restent indéterminés la journée en cours, les jours non prévus pendant lesquels l'apprenant travaille et l'unicité des jalons « 100 notions » et « 30 jours ».

## Décision

1. La journée locale en cours ne casse jamais la série : elle compte si elle est déjà qualifiante, sinon elle est neutre.
2. Un jour qualifiant compte toujours, même hors des jours d'étude. Un jour non qualifiant est neutre s'il n'est pas un jour d'étude ou s'il est couvert par une pause globale, sinon il casse la série. Le parcours s'arrête au premier jour cassant ou avant le premier jour qualifiant de l'historique.
3. Jalons « 100 notions retenues » et « 30 jours de série » : une seule fois par utilisateur (`ref_id` nul) ; « module validé » : une fois par module (`ref_id` = module).

## Conséquences

La contrainte `unique(user_id, key, ref_id)` de `milestones` doit être déclarée `nulls not distinct` ; à défaut, le service vérifie l'existence sous verrou avant insertion.
