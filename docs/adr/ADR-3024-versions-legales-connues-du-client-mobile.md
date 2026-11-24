# ADR-3024 — Versions legales connues du client mobile

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : SPEC-3402, ADR-3008, ADR-3001

## Contexte

SPEC-3402 : une premiere connexion par Apple ou Google doit imposer l'acceptation des CGU (BR-ACC-02). La feuille existante lit les versions actives dans le refus 422 LEGAL_ACCEPTANCE_REQUIRED, mais toProblem ne serialise les errors que pour VALIDATION_FAILED (et deux codes voisins) : verifie contre la pile locale, ni le 422 ni le 409 CONFLICT de POST /me/legal-acceptances ne portent les versions. Aucune route ne les expose et le contrat est hors zone de la piste mobile avant P35.

## Décision

Le client mobile embarque les deux versions actives de sa version (src/auth/legal-versions.ts, information publique affichee sur les pages legales) et les soumet a POST /me/legal-acceptances ; le serveur reste seul juge et refuse une paire perimee (409). L'acceptation n'est jamais enregistree sans action du porteur. P35 doit exposer les versions actives aux clients (route ou champ de /me) pour supprimer cette constante.

## Conséquences

Un changement de version sans nouvelle version de l'application laisse la feuille en erreur : l'acces reste ferme plutot que d'enregistrer une acceptation erronee. L'ecart est consigne dans evidence/SPEC-3402/acceptance.md.
