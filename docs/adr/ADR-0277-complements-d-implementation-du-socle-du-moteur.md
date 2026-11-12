# ADR-0277 — Compléments d'implémentation du socle du moteur

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-401, ADR-0020, ADR-0140, ADR-0047, ADR-0254

## Contexte

SPEC-401 fixe les types, le temps, l'aléa et le jeu SAP. L'implémentation a révélé trois points à consigner : REFERENCE_NOW canonique avec millisecondes, la règle de décalage d'une heure locale inexistante qui diffère de localTimeToInstant de SPEC-207, et l'écart entre les 64 liens annoncés et les 59 liens réels de Carte.dc.html.

## Décision

1) REFERENCE_NOW = 2026-11-11T12:20:00.000Z est exporté par @learny/testing/clock ; FIXED_TIME_ISO reste inchangé pour les tests existants. 2) localTimeToShiftedInstant, ajouté à @learny/core, décale une lecture inexistante de la durée du saut (02:30 → 03:30 à Paris) ; instantsAtLocalTime conserve la règle SPEC-207. 3) SAP_LINKS contient les 59 liens de la maquette (54 prérequis, 1 confusion, 4 tuteur) ; le nombre affiché est SAP_LINKS.length. 4) La page /_dev/sdd/SPEC-401 partage son contenu avec le registre SDD et est rendue par la route dynamique, la route statique homonyme étant masquée par [specId] dans Next 16. 5) Le test import/no-restricted-paths utilise un import relatif inter-paquet résolvable ; le spécificateur @learny/db est refusé par no-restricted-imports, le résolveur Node ne résolvant pas les exports TypeScript workspace.

## Conséquences

SPEC-402 à SPEC-411 consomment ces contrats sans les redéfinir. Les preuves de SPEC-401 montrent 59 liens et la page SDD fonctionne avec et sans ENABLE_SDD_PAGES.
