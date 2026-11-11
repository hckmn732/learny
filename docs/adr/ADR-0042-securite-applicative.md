# ADR-0042 — Sécurité applicative

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-208, SPEC-805

## Contexte

Durcissement standard.

## Décision

En-têtes : CSP stricte avec nonce, HSTS, X-Content-Type-Options, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy. Limitation de débit par seau à jetons en Postgres (`rate_limits`). CSRF : vérification d'origine sur les mutations. Dépendances auditées (`pnpm audit`, niveau high bloquant). Liste de contrôle OWASP ASVS niveau 1.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
