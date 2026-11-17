# Audit des dépendances — SPEC-805

- Commande : `pnpm audit --audit-level high --json`
- Verrou : `pnpm-lock.yaml` (1341 dépendances)
- Commit audité : `40923d62`
- Date : 2026-11-17
- Résultat : 0 vulnérabilité `high`, 0 `critical`, 4 `moderate` (non bloquantes pour le niveau exigé par ADR-0042), 0 low, 0 info.
- Sortie brute : `pnpm-audit.json` ; synthèse machine : `audit.json`.

Aucun secret, cookie, clé ou contenu d’apport n’est présent dans ce rapport.
