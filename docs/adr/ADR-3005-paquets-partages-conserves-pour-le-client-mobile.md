# ADR-3005 — Paquets partagés conservés pour le client mobile

- **Statut** : Acceptée — complète ADR-1007, amende l'étape 2 de `docs/architecture/python-backend/P23-plan.md`
- **Origine** : Déduite (préparation de la piste mobile)
- **Date** : 2026-11-22
- **Liens** : ADR-1004, ADR-1007, ADR-2004, ADR-3001, SPEC-3001, SPEC-3003

## Contexte

ADR-1004 prévoit que l'application mobile réutilise `@learny/contracts`, `@learny/api-client`,
`@learny/domain`, `@learny/i18n` et `@learny/ui/tokens`. Or `P23-plan.md` (étape 2, point 3)
prévoit de retirer à la fin de la migration Python tout paquet que le web n'importe plus, dont
`domain` et `learning-engine`. Le mobile a besoin de `@learny/domain` : dérivations de l'accueil
(`home/derive`) et évaluation locale des réponses de révision (`review/game-response`), cette
dernière indispensable au quiz global hors ligne (BR-PLA-01), qui dépend de
`@learny/learning-engine`.

## Décision

1. Sont **clients** (jamais retirés tant qu'un client les importe, `apps/web` **ou**
   `apps/mobile`) : `@learny/core` (entrée `.`), `@learny/contracts`, `@learny/api-client`, le SDK
   généré par SPEC-2002, `@learny/domain`, `@learny/learning-engine`, `@learny/i18n`,
   `@learny/ui` (sous-chemin `tokens`) et `@learny/bricks` (types, charges publiques et `grade()`,
   qui corrige localement les réponses du quiz global hors ligne, SPEC-801 EF-6).
2. Le calcul de l'ensemble des paquets retirables (P23-plan, étape 2, point 3) prend en compte le
   graphe d'imports de `apps/mobile` en plus de celui de `apps/web`. SPEC-3001 ajoute cette
   précision à `P23-plan.md` ; le commit est rapatrié sur `main` dès sa création
   (`git cherry-pick`) pour que la piste Python l'applique.
3. La piste mobile ne fait que des **ajouts rétrocompatibles** à ces paquets (nouvelles
   fonctions, nouvel espace de messages `mobile`) ; elle ne change aucune signature ni aucun
   libellé existant. Tout paquet partagé reste exécutable sous React Native (aucun `node:*`,
   `next/*`, `react-dom`, règle ESLint d'ADR-1007).
4. Le mobile consomme le contrat par `@learny/api-client` ; quand SPEC-2002 aura généré le SDK
   depuis `api/openapi.yaml`, `@learny/api-client` s'appuie dessus et le mobile n'a rien à changer.

## Conséquences

- Si la piste Python retire malgré tout un de ces paquets avant la fusion de `mobile`, la
  synchronisation (`sync-main.mjs`) le restaure dans la branche `mobile` et un ADR consigne
  l'écart.
