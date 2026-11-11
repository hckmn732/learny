# ADR-0178 — Contexte de la discussion avec le tuteur

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-610

## Contexte

BR-TUT-02 liste les éléments de contexte retirables ; il faut fixer leur contenu exact, leur budget et leur persistance.

## Décision

1. Six clés, dans cet ordre : `formation`, `chapter`, `passage` (présente seulement si un passage est fourni), `resources`, `gap` (présente seulement si une lacune ouverte existe sur une notion du module ; la plus faible), `profile`. Toutes incluses par défaut.
2. Le client envoie avec chaque message `context: { include: { clé: booléen }, passage?: { text (12 à 1 000 caractères), sectionId? } }` ; le serveur reconstruit seul le contenu de chaque élément et l'enregistre dans `tutor_messages.context` du message de l'apprenant. Les états inclus/retirés persistent pour la discussion (repris du dernier message de l'apprenant).
3. Budget `read_resources` : 4 000 tokens (ai.md §3), seulement si `resources` est inclus, passages filtrés sur le module du cours. Sans `resources`, aucune source d'apport n'est citée.
4. Passage : sélection d'au moins 12 caractères dans l'article du cours, espaces normalisés, affichée tronquée à 90 caractères dans la barre de sélection et à 160 dans le contexte, envoyée jusqu'à 1 000 caractères.
5. Historique envoyé au modèle : 20 derniers messages plus un résumé (ADR-0040) produit par la tâche `light` dès que la discussion dépasse 20 messages.

## Conséquences

Le compteur « n éléments » = nombre de clés présentes et incluses.
