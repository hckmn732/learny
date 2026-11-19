# ADR-0338 — Suppression du benchmark INP Playwright

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-19
- **Liens** : SPEC-804, ADR-0333, ADR-0202

## Contexte

Le benchmark INP du job performance est non déterministe sur les runners partagés : après plusieurs corrections ciblées, web-vitals n'est pas injecté sous la politique d'exécution et chaque scénario bloque le job pendant plusieurs dizaines de secondes. Le porteur décide de supprimer complètement ce benchmark.

## Décision

Supprimer le projet Playwright perf, les six scénarios, leur collecte dans test:perf et le mode manuel inp. Conserver Lighthouse LCP/CLS/TBT et k6 selon ADR-0333 (mesure complète, dépassement de budget non bloquant, blocage sous `PERF_STRICT=1`) ; ne prétendre à aucune mesure INP automatisée. Le budget INP de V1 reste une dette documentée sans benchmark exécutable.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
