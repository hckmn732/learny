# ADR-0209 — Plafond de vingt notions par module pour le quiz

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-405, SPEC-605

## Contexte

BR-QUI-03 exige de couvrir chaque notion du module dans chaque tentative, alors que ADR-0014 borne le quiz a vingt questions. Un module de plus de vingt notions rend les deux contraintes simultanement impossibles.

## Décision

Un programme valide ne comporte pas plus de vingt notions par module. Le tuteur de conception et le structurant d'import proposent des modules de vingt notions au plus; une edition manuelle ou une sortie IA qui depasse cette borne est refusee a la validation avec MODULE_TOO_MANY_NOTIONS et demande de decoupage avant accord de l'apprenant. SPEC-405 reserve exactement une question par notion avant de completer le quiz jusqu'a sa taille cible 10 a 20; si la banque d'une notion est epuisee, la tentative n'est pas creee et SPEC-513 genere une variante. Aucun tirage n'est presente comme couvrant toutes les notions lorsque ce n'est pas le cas.

## Conséquences

SPEC-605 controle la borne a la validation du programme, SPEC-405 peut satisfaire BR-QUI-03 et les tests couvrent 1, 20 et 21 notions ainsi que la banque epuisee.
