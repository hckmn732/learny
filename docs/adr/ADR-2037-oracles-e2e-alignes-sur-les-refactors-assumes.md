# ADR-2037 — Oracles e2e alignés sur les refactors assumés

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-23
- **Liens** : ADR-2008, ADR-2019, ADR-1003, SPEC-001, SPEC-006, SPEC-009, SPEC-505, SPEC-1103, SPEC-709, SPEC-1203, SPEC-2207

## Contexte

ADR-2008 interdit de modifier un oracle e2e. Plusieurs tests contredisaient pourtant des choix faits volontairement par des refactors postérieurs : SPEC-709 (la plateforme ne fournit plus de modèle d'IA : le compte de démonstration possède son propre modèle, ANTHROPIC_API_KEY n'est plus exigée), SPEC-1203 (le web devient un client pur, sans base ni validation des secrets serveur ; /api/v1/health est relayé vers l'API) et SPEC-2207 (Inngest retiré au profit du worker Python). Ces tests ne mesuraient plus le fonctionnel mais l'état antérieur au refactor : spec-505, spec-009 (deux cas), spec-001, spec-006 (deux cas) et spec-1103.

## Décision

Décision du porteur du projet : un choix issu d'un refactor accepté est assumé ; la spécification, l'ADR et le test e2e qui le contredisent sont mis à jour, la spécification par une section Amendements datée qui cite cet ADR. Le web n'est responsable que de ses propres services : ses démonstrations affichent la santé de l'API lue sur sa route publique, ses serveurs de test sont prêts sur un fichier statique du web, et le refus d'un démarrage de production incomplet relève de l'API. Le test spec-505 vise la clé OpenAI ajoutée à côté du modèle de démonstration, qui est conservé (sans lui la recette simulée n'a plus d'IA). Cette dérogation à ADR-2008 ne couvre que les contradictions avec un refactor accepté : une régression du fonctionnel reste corrigée dans le code, jamais dans le test. Elle remplace ADR-2019.

## Conséquences

Specs amendées : SPEC-001, SPEC-006, SPEC-009, SPEC-505, SPEC-1103 (piste migration gelée, amendée sur décision explicite du porteur). Les lignes de base visuelles de ces pages ne sont pas régénérées par cet ADR. Écart ouvert : l'API Python ne refuse pas encore un démarrage de production incomplet (SPEC-009 CA-2 côté API), à porter dans une tâche dédiée en cohérence avec les fichiers compose de déploiement.
