# ADR-2025 — Offsets de passage en points de code et emission de resource/uploaded dans la transaction

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2203, ADR-2006, ADR-2008, ADR-2014

## Contexte

SPEC-2203 porte le decoupage de packages/ingestion et la finalisation des apports. Deux comportements du TypeScript ne se transposent pas tels quels en Python : (1) les emplacements {charStart,charEnd} des passages sont comptes en unites UTF-16 par JavaScript, alors que Python indexe des points de code ; (2) la finalisation emet resource/uploaded apres le commit avec une reclamation sur la ligne (metadata.upload.eventClaimedAt) et un minuteur de reprise, mecanisme propre a Inngest.

## Décision

(1) Les emplacements Python sont comptes en points de code. L'ecart n'apparait que sur des caracteres hors BMP (emoji) et decale alors les offsets suivants ; les vecteurs d'oracle du domaine excluent ces entrees et les tests d'egalite stricte portent sur le reste. (2) La finalisation ecrit resource/uploaded dans la meme transaction que la mise a jour de la ligne, avec l'identifiant stable resource-uploaded:<rid> et le marqueur upload.eventEmittedAt ; un rejeu n'emet pas de second evenement. La reclamation apres commit devient inutile puisque le worker Python (SPEC-2207) relit l'outbox, contrairement a Inngest.

## Conséquences

Aucun ecart observable par HTTP : les offsets ne sortent pas du domaine et l'evenement garde son nom, son payload et son identifiant. Si un apport contient des emoji, la citation peut pointer quelques caracteres trop loin ; un correctif ulterieur devra convertir les offsets en unites UTF-16 sans changer l'API. L'absence de reclamation signifie qu'un crash entre le commit et la livraison ne laisse pas de marqueur a reprendre : le dispatcher de l'outbox couvre ce cas.
