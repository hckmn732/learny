# ADR-2023 — home.get encore TypeScript car il depend du moteur d apprentissage

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-21
- **Liens** : SPEC-2201, SPEC-2202, ADR-2001, ADR-2005

## Contexte

home.get agrege la page d accueil a partir de calculateRetention et buildDailySession de packages/learning-engine, deja affectes a SPEC-2202, et de packages/domain/src/home/derive.ts. Porter ces fonctions en Python dans SPEC-2201 reviendrait a livrer le coeur du contexte learning avant sa specification, avec ses vecteurs et ses tests. L operation n a aucun test TypeScript dans api/inventory.json et aucun consommateur.

## Décision

home.get reste ts dans api/ownership.yaml. Le contexte identity est bascule a 13 operations : profil, preferences, onboarding, legal, en-tete et menu, qui ne dependent que de SQL sous RLS. La vue learny/views/home.py sera ecrite par SPEC-2202 avec le moteur d apprentissage.

## Conséquences

La page d accueil reste servie par Hono jusqu a SPEC-2202. Aucune regle metier n est dupliquee. Une fois SPEC-2202 livre, home.get passera a py sans nouvelle decision d architecture.
