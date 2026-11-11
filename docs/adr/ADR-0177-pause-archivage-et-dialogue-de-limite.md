# ADR-0177 — Pause, archivage et dialogue de limite des formations

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-618, SPEC-605, SPEC-724

## Contexte

BR-FOR-10 impose de mettre une formation en pause pour en créer ou reprendre une quatrième, « choix proposé dans un dialogue ». ADR-0016 fixe les effets de la pause. L'archivage n'est décrit nulle part.

## Décision

1. Formations actives = possédées au statut `active` + appartenances `member_status='active'` (fonction de SPEC-111). Les statuts `cadrage` et `programme_proposed` ne comptent pas ; la limite s'applique à la validation du programme, à la reprise et à l'acceptation d'une invitation.
2. Une opération qui ferait dépasser 3 renvoie 422 `FORMATION_LIMIT_REACHED` avec `errors.activeFormations: [{ id, title, progressPercent, lastOpenedAt }]`. L'interface ouvre le dialogue « Trois formations sont déjà en cours » ; l'apprenant choisit la formation à mettre en pause ; le client rejoue l'opération avec `pauseFormationId` ; le serveur met en pause puis exécute l'opération dans la même transaction.
3. Pause : `status='paused'`, `paused_at`, créneaux futurs `cancelled`, automatismes de la formation suspendus, série non affectée. Reprise : contrôle de la limite, `status='active'`, `paused_at = NULL`, replanification depuis le jour de reprise.
4. Archivage : possible depuis `paused`, `completed`, `cadrage` ou `programme_proposed` (jamais depuis `active`) ; `status='archived'`, créneaux futurs annulés, aucune révision ; la formation disparaît de l'accueil et du sélecteur ; les données restent exportables. Pas de désarchivage en V1.
5. Formation courante (ADR-0075) : si la formation courante est mise en pause ou archivée, `current_formation_id` passe à la formation active de `last_opened_at` le plus récent, sinon NULL.

## Conséquences

SPEC-605 et SPEC-724 réutilisent le dialogue et le paramètre `pauseFormationId` livrés par SPEC-618.
