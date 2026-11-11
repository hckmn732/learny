# ADR-0173 — Remédiation ciblée

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-612, SPEC-715

## Contexte

BR-AUT-04 décrit une remédiation d'environ 15 minutes (texte ciblé, extraits, nouvelles questions) sans en fixer la structure, la fin ni le lien avec le délai de nouvelle tentative.

## Décision

1. À `quiz/graded` en échec, la fonction `remediation-prepare` crée **une** activité `remediation` pour la tentative échouée contenant, pour chaque lacune du module (3 au plus, par maîtrise croissante) : une brique `text` rédigée selon la nature (BR-LAC-04), 0 à 2 briques `resource_excerpt` (passages déjà cités dans le cours), 2 questions corrigées par le code tirées de la banque (pour une confusion : format qui oppose les deux notions). Durée annoncée : 15 min.
2. Tâche IA `gaps` pour les textes ; les questions viennent de la banque (génération seulement si elle est épuisée).
3. La remédiation est terminée quand toutes ses questions ont une réponse et que l'apprenant clique « Terminer la remédiation » (`POST /modules/:mid/remediation/complete`). Ses réponses alimentent la maîtrise et FSRS avec `review_source='validation'`.
4. Nouvelle tentative disponible à `submitted_at` de la tentative échouée + délai de l'automatisme 4 (défaut 24 h). En mode « obligatoire », elle exige aussi la remédiation terminée. Si l'automatisme 4 est désactivé : aucune remédiation automatique (elle est générée à la demande par « Remédiation ciblée ») et délai 0.
5. Une remédiation précédente non terminée du même module est archivée (`activities.status='archived'`) au profit de la nouvelle.

## Conséquences

SPEC-715 règle et journalise ; la mécanique est livrée par SPEC-612.
