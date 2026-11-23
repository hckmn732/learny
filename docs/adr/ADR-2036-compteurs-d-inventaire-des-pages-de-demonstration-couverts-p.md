# ADR-2036 — Compteurs d'inventaire des pages de démonstration couverts par exception de checkpoint

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-23
- **Liens** : CP-21, CP-22, ADR-2008, ADR-2019, SPEC-113, SPEC-2001, SPEC-2207

## Contexte

Trois tests e2e lisent un inventaire vivant de la plateforme et le comparent à une constante figée au moment de leur écriture : p1/spec-113 attend 59 tables publiques et 59 sous RLS forcée, la base en compte 60 depuis la table job_deliveries ajoutée par SPEC-2102 ; p20/spec-2001 attend 49 événements au catalogue, il en compte 50 depuis job/daily-digest ajouté par SPEC-2207 (ADR-2014) ; p22/spec-2207 attend 190 opérations servies par Python sur 217, ownership.yaml en déclare 201 depuis les démonstrations portées par SPEC-2302. Chaque écart est une croissance légitime de l'inventaire et non une régression du fonctionnel. ADR-2008 interdit de modifier ces oracles e2e ; sans décision, CP-21 et CP-22 ne peuvent pas passer.

## Décision

Décision du porteur du projet : ces trois assertions, et elles seules, sont couvertes par exception lors des checkpoints de la piste python-migration, à une condition vérifiée et consignée dans le résumé du checkpoint : la valeur affichée par la page égale l'inventaire réel au même instant (tables publiques toutes sous RLS forcée, nombre d'événements de api/events.schema.json, nombre d'entrées py de api/ownership.yaml), et les assertions qui suivent la constante passent elles aussi : comme Playwright s'arrête au premier échec, elles sont vérifiées en rejouant une copie temporaire du test, jamais commitée, où seule la constante est remplacée par la valeur mesurée. Les tests ne sont pas modifiés, aucune ligne de base n'est régénérée. Une nouvelle constante divergente ou un autre test n'entre pas dans cette exception sans nouvel ADR.

## Conséquences

Le résumé des checkpoints CP-21, CP-22 et suivants cite cet ADR et les valeurs mesurées. Les échecs de captures @visual restent traités par la mesure de référence evidence/checkpoints/preexisting-e2e-failures.md (précédent ADR-2019), pas par cet ADR. Le porteur peut décider plus tard de mettre à jour les constantes, ce qui rendrait cette exception caduque.
