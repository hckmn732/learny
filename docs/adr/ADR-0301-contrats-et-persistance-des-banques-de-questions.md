# ADR-0301 — Contrats et persistance des banques de questions

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-513, ADR-0026, ADR-0048

## Contexte

SPEC-513 laisse ouvertes la clé d'idempotence, l'emplacement du journal de lot, les formats pertinents et la façon de lire les passages du cours privé sans partage entre membres.

## Décision

Les formats sont choice_question, open_question, cloze et matching. La clé de job est (apprenant, notion, format, version de cours) dans question_bank_jobs, avec statut, compteurs et code d'erreur sûr. Le service valide chaque brique par SPEC-501, déduplique les empreintes de toutes les briques de la notion et sérialise les insertions par un verrou consultatif. Le cours et les passages sont lus via le client RLS du propriétaire ; l'appel modèle passe par @learny/llm avec batch=true et le mock déterministe. Une banque incomplète reste signalée et n'est jamais marquée prête.

## Conséquences

Les jobs sont repris la nuit et une version de cours remplacée conserve ses jobs. Aucun contenu privé ni message fournisseur n'est journalisé.
