# ADR-2028 — Qualification BYOK : sondes de connexion et de compatibilite seulement

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2204, SPEC-506

## Contexte

Le service TypeScript qualifyCredential porte deux protocoles : les sondes de connexion et de compatibilite par tache, seules atteignables par l operation publique me.ai.credentials.qualify, et une batterie de treize briques (runQualification, briques, notification) reservee a la page de demonstration du SDD (option legacyBattery, jamais posee par la route).

## Décision

Porter le protocole atteignable par la route : sonde de connexion legere (statut qualified et date) ou sondes de compatibilite de la tache (codes de reserve non bloquants, rapport persiste sous credentialId:modelId:task). La batterie de treize briques, markCredentialStatus et stopAfterInvalidBrick restent hors de cette tranche (SPEC-2207, page de demonstration).

## Conséquences

Aucun changement visible par le client : qualify repond la meme union (AiConnectionReport, AiTaskCompatibility, QualificationReport). Les fixtures de la batterie restent commitees et reutilisees par la session de qualification. Une route qui exposerait un jour la batterie demandera un nouvel ADR.
