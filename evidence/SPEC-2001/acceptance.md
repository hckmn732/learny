# SPEC-2001 — critères d'acceptation

Chaque critère est coché avec sa preuve vérifiable (fichier, commande, résultat mesuré le
2026-11-21 sur la VM de dev, commit `e1d2348c` puis validation complète).

- ✅ **CA-1** — `evidence/SPEC-2001/inventory.md` couvre les **217 opérations** du registre, les **32 routes spéciales** (dont les flux SSE `relayStream` et le webhook Stripe `billing.webhook`), les **49 événements** d'outbox et les **22 jobs** ; chaque opération porte son acteur (`auth`), son contexte cible, sa spécification de la piste, son module d'implémentation, les tables SQL lues/écrites et les tests existants. Les **141 opérations sans test existant** sont explicitement signalées « CL-1 », conformément au cas limite CL-1 de la spécification : elles reçoivent un test de caractérisation HTTP (oracle de parité) lors de la migration de leur opération. Preuve : `tools/migration/inventory.mjs`, `api/inventory.json`, et les tests `[SPEC-2001]` de `tools/migration/test/unit/inventory.test.ts` (« covers the 217 operations… », « gives every operation an actor… », « renders every operation id… »).

- ✅ **CA-2** — Le test de dérive `[SPEC-2001]` « fails when the committed inventory drifts from the registries » compare `api/inventory.json` au résultat recalculé depuis les registres vivants (`ROUTES`, manifeste spécial, `EVENTS`, jobs) : toute opération ajoutée ou retirée sans régénération fait échouer la suite. La commande `inventory.mjs --check` échoue de la même façon en intégration continue. Preuve : `tools/migration/test/unit/inventory.test.ts`, sortie « Inventory up to date: 217 operations ».

- ✅ **CA-3** — Les oracles se rejouent deux fois de suite à l'identique contre le TypeScript : **67 scénarios enregistrés puis rejoués deux fois sans aucune divergence**. La comparaison est sémantique (statut, en-têtes autorisés, corps JSON normalisé) et les valeurs non déterministes sont normalisées par une règle explicite (identifiants, horodatages, e-mails, durées mesurées, plans `EXPLAIN`), conformément à CL-2. Preuve : `evidence/SPEC-2001/parity-check.log`, `api/oracles/recordings/reads.json`, test d'intégration `tools/parity/test/integration/parity.test.ts`.

- ✅ **CA-4** — `evidence/SPEC-2001/test-port-map.md` liste les **443 fichiers de test backend** (2 942 cas) avec, pour chacun, le module pytest cible, la spécification de la piste qui le portera et le statut (`todo`). Les tests de `apps/web` restent en TypeScript et sont hors carte. Preuve : génération par `inventory.mjs --port-map`, test `[SPEC-2001]` « maps every backend test file to a pytest module and a python-track spec ».

- ✅ **CA-5** — `node tools/migration/report.mjs --check` affiche **217** routes du registre (au lieu de 219) : `countRegistryRoutes` soustrait désormais les `defineRoute(` situés dans les fabriques `demo()`/`action()`. Preuve : `tools/migration/report.mjs`, test `[SPEC-2001]` « counts the 217 real routes and ignores the factory definitions (CA-5) ».

## Note sur les lacunes CL-1

Les 141 opérations sans test existant sont listées nominativement dans `inventory.md` (colonne
« Gap »). La spécification (CL-1) demande qu'un test de caractérisation HTTP soit ajouté **avant**
la migration de chacune : c'est exactement le rôle du harnais `tools/parity/` livré ici, dont les
scénarios couvrent déjà 64 opérations de lecture. Les 77 opérations restantes sont des mutations
ou des routes à paramètre qui reçoivent leur chaîne d'appels écrite à la main dans la spécification
qui les porte (P22), sans jamais modifier l'oracle.
