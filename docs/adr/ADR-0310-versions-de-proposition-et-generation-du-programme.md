# ADR-0310 — Versions de proposition et génération du programme

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-605

## Contexte

SPEC-605 exige une proposition versionnée, un import privé, un ajustement qui ne touche pas la structure active et une validation transactionnelle. Le modèle de données ne disposait pas de table de versions et l'écran programme devait générer la proposition après le cadrage.

## Décision

Ajouter programme_proposals (une ligne par version, charge ordonnée validée par Zod, source generated|imported) et conserver le fichier importé dans programme_imports.original_content. La génération remplace la proposition initiale uniquement quand aucune version n'existe ; l'ajustement et l'import créent N+1 sans toucher modules, chapitres, notions ni schedule_slots. La page Programme déclenche une génération unique quand le cadrage est terminé et qu'aucune version n'existe. La validation prend un verrou consultatif, vérifie la version attendue, la limite de trois formations actives, crée la structure et module_progress, puis émet formation/programme-validated avec un identifiant déterministe ; le job plan-programme planifie une seule fois.

## Conséquences

Les anciennes versions restent lisibles par GET /programme?version=N. Un double clic ou un rejeu ne crée ni deuxième structure ni deuxième événement. Le fichier d'origine reste côté serveur et n'est jamais renvoyé par l'API.
