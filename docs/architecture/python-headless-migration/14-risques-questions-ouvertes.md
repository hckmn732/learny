# 14 — Risques et questions ouvertes

## Risques

| Risque | Impact | Signal | Mesure |
|---|---|---|---|
| Deux pistes migration | Critique | main contient Hono, suivi 1101–1302 pending, worktree ancien | décider clôture/arrêt Hono avant nouvelles specs |
| Dépendance V1 | Élevé | CP-8 n’est pas complete dans l’état lu; P12 l’exige | clôturer ou documenter changement de dépendance |
| Réécriture sous-estimée | Critique | 219 routes, services et parcours riches | route inventory, vertical slices, critères de parité |
| Divergence RLS | Critique | claims Supabase, auth.uid, serviceDb privilégié | garder policies, refaire toute la matrix sous Python |
| Perte/doublon events | Critique | outbox + retries + cron | event ID, idempotence, replay, single consumer owner |
| Drift contrat | Élevé | Zod TS + Python + OpenAPI | OpenAPI source, generated SDK, compatibilité CI |
| Flux SSE incomplet | Élevé | protocole AI UI dans tutorat | capturer tous events/cancel/resume/error tests |
| Baisse qualité retrieval | Élevé | dépend modèle/dimension/chunking | garder modèle initial et évaluer recall |
| Épuisement connexions DB | Élevé | pool multiplié par process + Supabase services | budget global, pooler test, alertes |
| Gap SDK Inngest Python | Élevé | parité TS incomplète | checklist feature actuelle et Temporal POC |
| Coûts IA dupliqués | Élevé | retry après timeout de provider | réservation idempotente, journaux coûts |
| Suppression RGPD incomplète | Critique | données dans DB, storage, vectors, logs/providers | receipt par domaine et rétention |
| Résidence UE inconnue | Élevé | hébergement et fournisseurs externes | revue DPA/regions avant cutover |
| Capacité cible inconnue | Élevé | 100–500k actif sans concurrency/RPS | collecter 4 semaines telemetry |
| Drift des preuves SDD | Élevé | état diffère code et migration worktree | réconcilier catalogue, progress, preuves |

## Questions internes non observables

1. Pourquoi Python: recrutement, standard interne, AI ecosystem, intégrations tierces ou coût? Défaut: limiter à POC tant que bénéfice et coût ne sont pas chiffrés.
2. Quelle capacité de l’équipe Python et de l’exploitation? Défaut: monolithe et équipe de garde petite.
3. Quels DAU/MAU, simultanéité, RPS p95, SSE, volume fichiers et spend IA? Défaut: aucune capacité garantie; telemetry quatre semaines.
4. Les contrats Vercel/Supabase/Inngest et fournisseurs IA garantissent-ils région UE et DPAs? Défaut: conserver BR-PLA-04 et vérifier juridiquement.
5. Quelles fonctions Inngest/plan sont réellement actives? Défaut: rester sur Inngest si fonctions SDK Python requises passent conformité, sinon Temporal POC.
6. Audio/vidéo traités par un worker non trouvé? Défaut: classer P9 partial/planned jusqu’à preuve code et tests.
7. Volume production DB, fichiers, vectors, historique et rétention? Défaut: garder schema/storage et pas de bulk copy.
8. Besoin réel API keys/OAuth et identité service-to-service? Défaut: Supabase JWT d’abord, pas d’API key générique.
9. MCP mutation autorisée et qui consent? Défaut: read-only.
10. Fenêtre maintenance, backup/restore, canary et rollback acceptables? Défaut: par route/tenant, single writer.

## Hypothèses

- Les invariants BR/ADR restent normatifs.
- Postgres/Supabase reste source de vérité pendant le portage.
- Les SLO supplémentaires de 08 sont hypothèses, pas engagements.
- Code/BDD prod et credentials ne sont pas consultés; les limites externes sont à documenter sans inventer.


### Écart de couverture API

Le document OpenAPI contient 217 opérations contre 219 routes du registry. Réconcilier les deux entrées manquantes avant de considérer le contrat publié exhaustif.
