# ADR-0103 — Conventions de commit complétées et détection des secrets

- **Statut** : Acceptée
- **Origine** : Déduite (décision prise lors de la rédaction des spécifications P0, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-002, SPEC-011, ADR-0051

## Contexte

`docs/engineering/git.md` §2 liste 12 types de commit et une description de 72 caractères au plus. Or `tools/sdd/complete.mjs` crée des commits de fusion `merge(SPEC-xxx): <titre de la spécification>` : le type `merge` n'est pas listé, les titres commencent par une majuscule (refusés par la règle `subject-case` de `@commitlint/config-conventional`) et certains dépassent 72 caractères (jusqu'à 73 caractères de description, 89 d'en-tête). Le hook `commit-msg` s'exécute aussi sur `git merge`. Par ailleurs gitleaks n'est pas toujours installé sur le poste de l'agent, et les tests ont besoin de fausses clés.

## Décision

1. Types autorisés : ceux de git.md §2 plus `merge`. Portée obligatoire au motif `^(SPEC-\d{3}|CP-\d|sdd)$`.
2. Règle `subject-case` désactivée (français, noms propres). Description ≤ 72 caractères, sauf type `merge` ≤ 100 ; en-tête ≤ 100.
3. Détection des secrets avant commit : `tools/security/check-secrets.ts` exécute gitleaks s'il est présent **et** un analyseur intégré (motifs de `packages/config/src/secret-patterns.ts`), refuse tout fichier `.env*` (sauf `.env.example`), `.pem`, `.p12`, `.key`. En CI, gitleaks est obligatoire (SPEC-011).
4. Toute valeur factice ressemblant à un secret dans le dépôt doit contenir le mot témoin `learny-test-only`, ignoré par les deux analyseurs (`stopwords` gitleaks).

## Conséquences

Les commits de l'outillage SDD passent les hooks sans `--no-verify`. git.md §2 devrait mentionner le type `merge` (correction documentaire suggérée).
