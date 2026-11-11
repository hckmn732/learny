# ADR-0100 — Amorçage du dépôt Git et identité de l'agent

- **Statut** : Acceptée
- **Origine** : Déduite (décision prise lors de la rédaction des spécifications P0, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-001, SPEC-002, ADR-0051

## Contexte

`docs/engineering/git.md` suppose un dépôt initialisé localement sur `main`, mais la copie de travail peut ne pas être un dépôt Git au moment où SPEC-001 démarre. L'outillage (`tools/sdd/start.mjs`, `complete.mjs`) tolère l'absence de dépôt mais les hooks (SPEC-002), les branches `spec/…` et les fusions `--no-ff` en ont besoin. Un commit exige une identité.

## Décision

1. Si `git rev-parse --is-inside-work-tree` échoue au début de SPEC-001, l'agent exécute `git init -b main`, crée `.gitignore`, committe tout le référentiel existant avec le message `chore(sdd): initialise le référentiel`, puis crée la branche `spec/SPEC-001-monorepo-application-web-minimale-et-soc` depuis `main`.
2. Si `git config user.name` ou `user.email` est vide, l'agent configure **au niveau du dépôt uniquement** (`git config --local`) : `user.name = Learny SDD Agent`, `user.email = sdd-agent@learny.invalid` (domaine réservé RFC 2606). La configuration globale n'est jamais modifiée.
3. Aucun remote n'est ajouté ni modifié (ADR-0051) ; `origin` est ajouté par le porteur du projet.

## Conséquences

Le premier commit de `main` contient le référentiel initial ; l'historique de `main` n'est jamais réécrit ensuite. Les commits de l'agent sont identifiables par leur auteur.
