# ADR-0278 — Contrats d’implémentation de la répétition espacée FSRS

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-402, ADR-0025, ADR-0140, ADR-0242

## Contexte

SPEC-402 exige une fonction pure sans import de packages/config, alors que les bornes métier (fenêtre 50, minimum 5, défaut 20 s, facteurs 2 et 0,5) viennent du catalogue. Le retour d'une carte de rappel sans choix et l'ordre de sélection des réponses à instant égal ne sont pas fixés par la spécification.

## Décision

1) gradeReview reçoit un objet settings dont la forme reprend les clés ENGINE.fsrs (medianWindow, medianMinSamples, defaultMedianMs, hardFactor, easyFactor) ; l'appelant les transmet, le module n'importe pas packages/config. 2) Une carte de rappel sans selfRating renvoie rating null et reason incomplete, ce qui interdit toute mise à jour (CL-4). 3) La médiane trie les candidats par answeredAt décroissant, puis answerId et timeMs, afin que le résultat ne dépende jamais de l'ordre du tableau. 4) La rétention est validée dans ]0,1[ par le moteur ; l'appartenance à 0,85/0,90/0,95 reste validée à la frontière du service.

## Conséquences

Les services de SPEC-411 transmettent ENGINE.fsrs ; les tests et la démonstration peuvent réutiliser la constante telle quelle. ts-fsrs 6 supprimera elapsed_days, conservé ici pour la forme persistée de SPEC-107.
