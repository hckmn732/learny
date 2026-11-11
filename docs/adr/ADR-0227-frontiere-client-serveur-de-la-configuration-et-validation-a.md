# ADR-0227 — Frontière client/serveur de la configuration et validation au démarrage

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-009, SPEC-006

## Contexte

ET-6 exige une sous-entrée serveur et un lint de frontière, sans préciser le mécanisme. Par ailleurs le test e2e de SPEC-006 démarre le même build avec APP_ENV=production et ENABLE_SDD_PAGES=true pour constater un 404 : SPEC-009 refuse désormais ce démarrage (CL-4), donc ce cas d'exécution devient inatteignable.

## Décision

La configuration serveur n'est importable dans apps/web que depuis apps/web/lib/server-env.ts, seul adaptateur qui appelle parseServerEnv / parsePublicEnv ; le lint no-restricted-imports refuse @learny/config/server partout ailleurs dans apps/web et un test unitaire scanne les sources pour vérifier qu'aucun composant client ne l'importe. La validation a lieu une fois par processus : instrumentation register() côté web (runtime nodejs) et main() du worker avant l'ouverture du port. Le cas e2e de SPEC-006 qui démarrait un serveur de production est remplacé par la vérification du refus de démarrage (SPEC-009) ; la couverture unitaire de sddPagesEnabled en production est conservée et la démonstration SPEC-009 montre le garde. Le cas « ENABLE_SDD_PAGES=1 » de SPEC-006 reste valable : seul le mot exact true active les pages, toute autre valeur les désactive sans faire échouer le démarrage, ce qui conserve le 404 observé au lieu d'un arrêt. L'intégration SPEC-009 démarre réellement le worker et l'adaptateur de démarrage du web avec un environnement local puis une production tronquée.

## Conséquences

Un import accidentel d'un secret côté client échoue au lint et au test de frontière. Un environnement de production incomplet empêche tout démarrage, web comme worker. Le test e2e SPEC-006 ne peut plus observer un 404 en production : il vérifie le refus de démarrage, comportement plus strict et conforme à CL-4. La désactivation silencieuse d'un indicateur mal saisi reste possible pour ENABLE_SDD_PAGES uniquement (comportement historique de SPEC-006 conservé) ; les autres booléens de la configuration refusent une valeur hors true/false.
