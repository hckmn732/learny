# ADR-0164 — Déroulé et arrêt du cadrage par chat

- **Statut** : Acceptée
- **Origine** : Déduite (décision déjà référencée par SPEC-604)
- **Date** : 2026-11-11
- **Liens** : SPEC-604, SPEC-605

## Contexte

BR-FOR-01 limite le tuteur à cinq questions et BR-FOR-02 permet de générer le programme dès que périmètre et niveau visé sont renseignés. Le tuteur doit pouvoir clore le cadrage sans boucle ni écriture non validée.

## Décision

Chaque réponse produit un tour synchrone et non diffusé validé par le schéma `CadrageTurn` de SPEC-604 ; le serveur borne à cinq le nombre de questions, indépendamment de la sortie du modèle. Si le tuteur propose une sixième question, le code impose une conclusion. « Générer le programme » n'est activé qu'après périmètre et niveau visé ; le clic conclut le cadrage sans exiger les cinq tours. La formation garde le statut `cadrage` jusqu'à la création effective d'une proposition de programme par SPEC-605. Le premier écran affiche « Commencer le cadrage » et les objectifs choisis ; leurs défauts sont ceux de SPEC-604 §5. Les actions du modèle passent par le registre et les schémas de `docs/architecture/ai.md`, jamais par une mutation directe.

## Conséquences

Les tests couvrent zéro à cinq questions, sortie invalide, fermeture anticipée, reprise du chat et échec du fournisseur sans perte de la formation.
