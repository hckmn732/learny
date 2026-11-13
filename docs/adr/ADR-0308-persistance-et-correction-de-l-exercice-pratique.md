# ADR-0308 — Persistance et correction de l’exercice pratique

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-613, ADR-0027, ADR-0047, ADR-0048, ADR-0150

## Contexte

SPEC-613 doit livrer un exercice pratique générique (production texte, fichier, lien ou tableau
structuré), deux indices au plus, une correction par critère et une reprise après rechargement. Le
référentiel possède déjà les tables `activities`, `attempts` et `answers`, et le schéma de brique
`instruction` d’ADR-0027, mais ne fixe ni le stockage du brouillon, ni l’identité d’un exercice
généré, ni le mode de correction simulé.

## Décision

- Un exercice est une `activity` de type `exercise` dont l’unique item pointe la version immuable
  d’une brique `instruction` ; `config` porte `notionId`, `courseVersion`, `hintsMax` et le seuil.
- `ensurePracticeExercise` est idempotent par `(notion, version du cours)` : un verrou consultatif
  et une lecture de la configuration renvoient l’activité existante au lieu d’en créer une seconde.
- Le brouillon est écrit à la position 1 de l’`answer` de la tentative en cours (`upsert`), sans
  correction ni appel au tuteur ; la soumission verrouille la tentative, valide la production puis
  écrit la réponse, la note, le feedback et l’événement `exercise/submitted` dans la même
  transaction.
- La correction utilise la fixture déterministe `mockTutor` (`LLM_MODE=mock`) : elle ne reçoit que
  la production validée et la consigne, borne chaque sous-score avant persistance (CL-5) et applique
  la pénalité d’indice. La maîtrise est ensuite appliquée par `applyLearningResult` (SPEC-411), qui
  accepte désormais le format `instruction`.
- Le résultat de correction est stocké dans `attempts.review_feedback` et relu tel quel ; aucune
  note n’est recalculée à l’affichage.
- Deux routes dédiées exposent les transitions de tentative (`/modules/:mid/exercises/:aid/attempts`
  et `/hint`) et la production (`/exercises/:aid/draft` et `/submissions`), avec les contrats Zod de
  `packages/contracts`.

## Conséquences

Aucune migration n’est nécessaire. Une nouvelle version de cours permet de régénérer l’exercice de
la même notion sans réécrire les tentatives passées. La correction simulée est reproductible et
vérifiable hors réseau ; le branchement d’un tuteur réel restera limité au remplacement du port
`ExerciseTutor`, sans changement de contrat ni de persistance.
