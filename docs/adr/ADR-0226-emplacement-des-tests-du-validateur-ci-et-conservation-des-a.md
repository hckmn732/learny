# ADR-0226 — Emplacement des tests du validateur CI et conservation des artefacts

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-011

## Contexte

SPEC-011 §9 nomme tools/ci/check-workflows.test.ts alors que le projet Vitest unitaire de SPEC-004 n'inclut que tools/**/test/unit/**/*.test.ts. La durée de conservation des artefacts et le mode d'installation d'actionlint ne sont pas fixés par la spécification.

## Décision

Le test unitaire reste à l'emplacement nommé par la spécification et vitest.config.ts ajoute tools/ci/*.test.ts. Les artefacts de test sont conservés 14 jours, les rapports de sécurité 30 jours, via ARTIFACT_RETENTION_DAYS et SECURITY_ARTIFACT_RETENTION_DAYS. actionlint est une dépendance locale obligatoire de ci:check ; son absence échoue avec l'instruction d'installation, act reste facultatif. gitleaks-action reçoit sa configuration par GITLEAKS_CONFIG avec GITLEAKS_ENABLE_COMMENTS=false.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
