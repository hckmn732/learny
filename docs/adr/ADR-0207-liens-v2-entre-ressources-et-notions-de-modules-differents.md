# ADR-0207 — Liens V2 entre ressources et notions de modules differents

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-903

## Contexte

BR-CAR-06 demande des liens reperes par le tuteur entre ressources et entre modules. Le modele V1 stocke notion_links mais pas les liens entre ressources; les ressources restent privees dans les groupes.

## Décision

SPEC-903 ajoute resource_links avec owner_id, formation_id, deux resource_id ordonnes canoniquement, rationale, supporting_chunk_ids, status accepted/rejected, created_at et contrainte unique par paire/proprietaire. Les liens entre notions de modules differents utilisent notion_links.kind=tutor avec owner_id de l'apprenant lorsque fondes sur ses ressources privees. La recherche semantique propose au plus cinq candidats par ressource; le tuteur valide par sortie structuree et le code controle appartenance, existence des passages et absence de doublon avant persistance. Aucun lien fonde sur les apports prives d'un membre n'est visible d'un autre membre. Une ressource supprimee retire les liens actifs qui l'utilisent; les citations historiques suivent BR-APP-10.

## Conséquences

La carte et le cours affichent la justification et les sources des liens acceptes; les tests couvrent isolation, doublons, suppression et validation de la sortie du tuteur.
