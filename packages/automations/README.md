# @learny/automations

Moteur des automatismes (SPEC-711, ADR-0190) : contrat `defineAutomation`, registre,
proposition d'actions (`runAutomation`), décisions de l'apprenant (`accept`, `decline`,
`undo`), expiration par tick horaire, journal de la semaine et réglages par utilisateur.

Les dix définitions métier (`reprise` à `pause`) sont ajoutées par SPEC-712 à SPEC-721 dans
`packages/automations/src/definitions/<cle>.ts` et enregistrées dans `automationRegistry`.
