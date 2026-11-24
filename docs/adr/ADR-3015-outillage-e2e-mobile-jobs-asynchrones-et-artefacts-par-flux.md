# ADR-3015 — Outillage e2e mobile : jobs asynchrones et artefacts par flux

- **Statut** : Acceptée — complète ADR-3012 et ADR-3004 ; § 1 (jobs asynchrones) remplacé par ADR-3018, § 2 à § 4 toujours en vigueur
- **Origine** : Déduite (retours d'implémentation de SPEC-3001 à SPEC-3003)
- **Date** : 2026-11-22
- **Liens** : ADR-3004, ADR-3012, SPEC-3001, SPEC-3002, SPEC-3003, SPEC-3101

## Contexte

La piste mobile valide ses spécifications sur un émulateur Android hébergé sur une **seconde**
machine (`i96p0dwzbg`), pilotée par un agent HTTP (`apps/mobile/e2e/device-agent.mjs`, ADR-3012).
Trois campagnes sur cinq ont échoué pour des raisons d'**outillage**, jamais de produit :

1. **Requêtes longues coupées.** `POST /maestro` exécute `maestro test` en synchrone (28 à 120 s).
   L'edge Agent37 ferme les connexions longues vers un port public ; le runner reçoit
   `container_unreachable` alors que Maestro continue sur l'appareil. Deux validations ont été
   déclarées rouges pour cette seule raison.
2. **Artefacts non rattachés aux flux.** L'agent renvoie un lot de captures ; `run-maestro.mjs`
   les indexe par nom de fichier. Trois flux visuels ont donc hérité de la même image et le même
   `diffRatio` (0,1638), ce qui a fait croire à un défaut de `compare.mjs`.
3. **Agent mono-requête.** Un Maestro fantôme (processus laissé vivant après une coupure) bloque
   toutes les campagnes suivantes : `container_unreachable` définitif jusqu'au redémarrage manuel.
4. **Ports publics périmés.** Chaque `publish` crée une URL neuve ; après un redémarrage ou un
   `resize` d'instance, l'URL de `e2e.env` ne route plus (404/000) et la campagne échoue au
   téléchargement de l'APK.

## Décision

1. **Contrat asynchrone.** `POST /maestro` répond immédiatement `{ jobId }` et exécute Maestro en
   tâche de fond ; `GET /maestro/{jobId}` renvoie l'état (`running`, `done`, `failed`), le JUnit
   complet et les artefacts. Aucune requête HTTP de la campagne ne dépasse ~5 s. Le mode
   synchrone reste disponible (`sync: true`) pour rejouer une campagne depuis une ancienne
   branche, jamais comme défaut.
2. **Artefacts par flux.** Chaque artefact porte le flux qui l'a produit
   (`{ flow, kind: 'video' | 'screenshot', name, base64 }`) ; le runner range par flux et
   `compare.mjs` compare **par flux**, avec le seuil de 12 % appliqué individuellement.
3. **Comptage dérivé du JUnit de Maestro**, relu depuis le fichier produit sur l'appareil ; un
   JUnit vide est un échec explicite, jamais un succès par défaut.
4. **Préflight obligatoire** avant toute campagne (`tools/dev/mobile-preflight.mjs`, appelé par
   `pnpm test:e2e:mobile`) : disque ≥ 4 Go, agent joignable (`/device`), APK servi (HTTP 200),
   URLs de `e2e.env` cohérentes — le préflight **republie** le port et réécrit `e2e.env` si
   l'URL ne répond plus, et redémarre l'agent si un Maestro orphelin est détecté.
5. **Discipline d'exécution** (runbook `docs/engineering/mobile-runbook.md`) : un seul build à la
   fois, ABI `x86_64` pour l'e2e, jamais de purge de `~/.gradle/caches/*/transforms` (les en-têtes
   prefab des modules natifs y sont extraits), jamais de suppression de
   `android/app/build/outputs` pendant une campagne.

## Conséquences

- Une campagne mobile ne peut plus échouer sur un transport : les échecs restants sont des
  assertions produit, ce que `validate.mjs` doit mesurer.
- Le coût est un polling de quelques secondes et un état de job en mémoire dans l'agent (perdu au
  redémarrage : une campagne interrompue se rejoue, elle n'est jamais considérée comme verte).
- Tant que la comparaison multi-flux n'a pas été validée sur deux specs consécutives, le runbook
  impose **un seul flux `@visual` par spécification**.
- La spec d'outillage dédiée est remplacée par ce chantier `chore/e2e-harness` : créer une
  `SPEC-3004` en P30 aurait invalidé le verrou de `start.mjs` et retardé CP-30.
