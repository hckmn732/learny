# ADR-2029 — Session de fixtures dans LlmGateway pour la batterie de compatibilite

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2204, ADR-0048, ADR-0153

## Contexte

En TypeScript, createSession selectionne une fixture par appel mais un meme LearnMockModel consomme ses etapes dans l ordre au sein d une session : la sonde structuree et la sonde d outil de la tache tutor lisent deux etapes differentes de la meme fixture. Le MockGateway Python etait sans etat par appel, ce qui aurait rendu la sonde vision de la tache light identique a la sonde structuree et produit une divergence de compatibilite.

## Décision

Ajouter session(task, prompt_id, scenario, fixtures) au protocole LlmGateway et un MockSession qui resout la fixture par appel et partage un curseur par fixture, comme LearnMockModel. Les fixtures de qualification et de compatibilite sont construites dans learny.platform.llm.qualification et passees par la session, jamais ajoutees au registre global des taches.

## Conséquences

Les adaptateurs vivants devront implementer session en deleguant a leurs appels ; les usages existants (stream, self-test) gardent step/object/stream sans changement. Un appel direct a MockGateway.step sans session conserve son comportement d avant.
