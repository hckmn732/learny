# ADR-3020 — Feuille du tuteur mobile sans POST /tutor/cards

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : SPEC-3303, SPEC-717, ADR-0193, ADR-3010, ADR-3018

## Contexte

La specification SPEC-3303 decrit « Creer une carte » par un appel POST /tutor/cards et une ouverture de la feuille depuis l ecran Cours (SPEC-3302). Ce contrat n existe pas sur la branche mobile : packages/contracts/ ne declare aucune route de carte, et la carte de rappel est creee par l automatisation questions_cartes (SPEC-717, ADR-0193) sous forme d une proposition card_created acceptee par meAutomationActionAccept. L ecran Cours de SPEC-3302 n est pas encore fusionne quand SPEC-3303 est implementee.

## Décision

Le mobile n invente aucune route. « Creer une carte » apparait sous la derniere reponse quand le serveur a reellement produit une proposition questions_cartes pour la conversation ; une fiche de confirmation (mode « avec ma confirmation ») appelle meAutomationActionAccept avec la cle d idempotence applicative puis affiche le toast « Carte creee · elle reviendra dans le quiz global ». La feuille est ouverte par la route tuteur?courseId=&chapterId=&sectionId= ; les deux identifiants sont optionnels et resolus depuis le programme courant, ce qui permet l ouverture depuis le cours (SPEC-3302), depuis « Demander au tuteur » et par lien profond.

## Conséquences

Aucune modification du contrat ni du backend (ADR-3001 § 4). La creation de la brique reste prouvee cote serveur par la campagne web de SPEC-717 ; cote mobile, les tests unitaires et de composant prouvent la confirmation, l acceptation idempotente et l absence de carte fantome. Le flux Maestro de coupure reseau est remplace par la preuve Vitest/Jest de « Arreter » puis « Reessayer », l emulateur etant partage (ADR-3018).
