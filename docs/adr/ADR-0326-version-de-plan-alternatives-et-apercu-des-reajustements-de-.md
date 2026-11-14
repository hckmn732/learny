# ADR-0326 — Version de plan, alternatives et aperçu des réajustements de l'agenda

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-14
- **Liens** : SPEC-705, SPEC-704, SPEC-407, ADR-0029, BR-AGE-05, BR-FOR-14, BR-AUT-11

## Contexte

SPEC-705 doit déplacer une activité et proposer les trois options BR-FOR-14 sans modifier le planning avant accord. Les tables formations, modules et schedule_slots n'ont pas de colonne de version ; l'horloge est figée en test, donc updated_at ne discrimine pas deux écritures successives.

## Décision

La version d'un créneau est un condensat SHA-256 tronqué de son identifiant, de ses horaires et de son statut ; la version du plan est un condensat SHA-256 tronqué des dates de fin, du volume, des statuts de modules, des créneaux planifiés et du rythme. Les alternatives viennent exclusivement de findCompatibleSlots (SPEC-407). Les options de réajustement viennent de planSchedule ; à défaut d'échéance dépassée, leur aperçu prolonge la fin du nombre de jours projeté, simule +1 h/jour et retire 10 % du contenu du module bloqué. Un déplacement crée un créneau avec moved_from_id et marque l'ancien moved. L'allègement crée une action pending_consent (BR-AUT-11) sans toucher au planning.

## Conséquences

Deux requêtes concurrentes portant la même version sont sérialisées par un verrou consultatif et la seconde reçoit 409 avec l'état courant. Les rejeux sont absorbés par une action d'automatisation à clé de déduplication, sans second événement. L'interface n'invente aucune disponibilité : elle affiche les heures locales calculées par le service.
