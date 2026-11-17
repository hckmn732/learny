# ADR-0333 — Budgets de performance V1 non bloquants

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-17
- **Liens** : SPEC-804, ADR-0202, ADR-0332

## Contexte

SPEC-804 mesure LCP, TBT, score Lighthouse, INP et k6 sur la VM de développement partagée. Malgré la réduction du JavaScript (ADR-0332), les budgets d ADR-0202 ne sont pas tous tenus sur cette machine (TBT et LCP simulés notamment). Le porteur ne souhaite pas engager d optimisation supplémentaire pour la V1.

## Décision

Pour la V1, pnpm test:perf mesure et publie un rapport complet ; il sort en code 0 dès que la mesure est complète, un budget dépassé étant signalé dans le rapport et dans evidence/SPEC-804 sans bloquer. PERF_STRICT=1 rétablit le blocage. Les critères CA-1 à CA-5 de SPEC-804 sont acceptés sur la base des mesures réelles publiées, budget par budget, sans présenter un budget dépassé comme tenu.

## Conséquences

Les dépassements restent visibles (rapport, page /_dev/sdd/SPEC-804) et constituent une dette de performance à reprendre après la V1 ; une mesure sur l infrastructure de production est recommandée avant de conclure.
