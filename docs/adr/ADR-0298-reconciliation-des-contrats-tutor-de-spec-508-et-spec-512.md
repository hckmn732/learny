# ADR-0298 — Réconciliation des contrats tutor de SPEC-508 et SPEC-512

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-508, SPEC-512

## Contexte

Les branches SPEC-508 (registre fermé, boucle, ToolContext/runtime) et SPEC-512 (moteur search_web, contexte fournisseur) ont livré deux contrats incompatibles dans packages/tutor : tableau TutorTool contre objet de descripteurs, SearchWebInput/SearchWebOutput propres à 508 contre SearchWebQuery/SearchWebOutput de @learny/contracts, et deux modules tool.ts/types.ts.

## Décision

Le registre ordonné TUTOR_TOOLS reste un tableau TutorTool pour la boucle et la démonstration ; il expose aussi les entrées par nom (TUTOR_TOOLS.search_web) et toolAllowedForTask pour SPEC-512. search_web conserve deux surfaces : searchWeb/guardSearchWeb/searchWebTool (moteur et contrat public SPEC-512) et searchWebTutorTool (adaptateur TutorTool/ToolContext utilisé par le registre, guard programme-only, exécution par le port runtime conformément à ADR-0296). createWebSearchPort relie le moteur 512 au port 508. tools/types.ts est l'unique contrat d'outil ; tools/tool.ts est supprimé.

## Conséquences

Les tests [SPEC-508] et [SPEC-512] passent sans modification ; apps/web garde searchWeb et les suggestions ; le registre des dix outils et la boucle 508 restent l'architecture unique.
