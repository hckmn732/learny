# ADR-0313 — Contrats et pipeline de génération du cours

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-608

## Contexte

SPEC-608 demande un cours par module, chapitre par chapitre, avec citations vérifiées et version active atomique. Le référentiel ne précise ni la forme exacte du brouillon agrégé, ni la clé d'idempotence, ni le sort d'une génération invalide.

## Décision

Le modèle rend un CourseChapterDraft par chapitre, agrégé en CourseDraft ; chaque section source porte ses sourceChunkIds et le chapitre reprend exactement leur union. Une clé de génération déterministe (celle de l'événement chapter/contributions-completed) est stockée dans courses.generation_key avec index unique par (owner, module, clé) : un rejeu retourne la version existante sans nouvel événement. Une génération invalide écrit une version status failed non courante, la version active précédente restant intacte. Le job utilise un client RLS du propriétaire, résout le modèle avec le client service et émet course/generated puis notification/requested après commit. Un cours de base sans apport porte ses suggestions dans le brouillon et les persiste comme ressources tutor_suggestion en attente.

## Conséquences

Les contrats CourseDraft et CourseChapterDraft sont la référence des fixtures ; courses.generation_key impose une migration ; une génération en échec reste consultable pour l'écran d'erreur sans remplacer la version active.
