---
id: SPEC-009
title: Configuration, variables d'environnement et secrets
phase: P0
priority: V1
depends_on: [SPEC-006]
business_rules: []
screens: []
adrs: [ADR-0011, ADR-0045, ADR-0073, ADR-0227, ADR-0228, ADR-0229]
visual: demo
---

# SPEC-009 — Configuration, variables d'environnement et secrets

## 1. Objectif

Faire de `@learny/config` la seule source de validation des variables d'environnement et des constantes métier utilisées par les paquets, le web et le worker. Distinguer configuration publique et serveur, empêcher l'exposition d'un secret au navigateur et refuser le démarrage d'un environnement de production incomplet.

## 2. Contexte

SPEC-001 crée `@learny/config` avec les régions d'hébergement ; SPEC-006 ajoute le web et ses pages de santé. Lire `.env.example`, `docs/engineering/conventions.md` §1, §5 et §9, `docs/architecture/overview.md` §2 et §6, `docs/product/business-rules.md`, `docs/architecture/ai.md` §1 et §6, ADR-0011, ADR-0045, ADR-0073. SPEC-210, SPEC-507 et SPEC-806 consommeront respectivement les modes Stripe, les tarifs IA et l'identité légale. Cette spécification pose les schémas et valeurs initiales sans appeler les services correspondants.

## 3. Dépendances

- **SPEC-006** : application web, route de santé, `apps/web/messages/fr.ts` et contrôle des pages SDD.
- **Bibliothèques** : Zod 4 installé par SPEC-001 ; aucune bibliothèque de fournisseur n'est nécessaire pour valider l'environnement.
- **Fichier d'exemple** : `.env.example` contient les noms de variables sans secret. Toute variable ajoutée au schéma doit être ajoutée au fichier et réciproquement, à l'exception des variables standard de Node, pnpm et CI explicitement énumérées.

## 4. Règles métier couvertes

Aucune règle `BR-*` n'est attribuée directement dans le catalogue. `product.ts` est le miroir de configuration des valeurs normatives de `docs/product/business-rules.md` ; il ne les redéfinit pas. ADR-0011 impose le mode IA personnelle ou abonnement ; ADR-0045 rend l'identité légale obligatoire pour une mise en production publique ; ADR-0073 fixe les tarifs initiaux configurables.

## 5. Exigences fonctionnelles

- **EF-1** — `parseServerEnv(raw, appEnv)` valide les variables côté serveur et retourne un objet typé. En `production`, une variable obligatoire absente ou vide provoque une erreur au démarrage qui nomme les variables manquantes sans afficher leurs valeurs. En `local` et `test`, les modes simulés permettent de lancer l'application sans clés de fournisseurs.
- **EF-2** — `parsePublicEnv(raw)` n'accepte et n'exporte que la liste blanche `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SENTRY_DSN`. Aucun champ `APP_ENCRYPTION_KEY`, clé service Supabase, clé IA, VAPID privée ou secret Stripe n'apparaît dans cet objet ni dans le bundle client.
- **EF-3** — `APP_ENV` vaut `local|test|preview|production`. `LLM_MODE` vaut `mock|live`, `STRIPE_MODE` vaut `mock|test|live`, `EMAIL_MODE` vaut `memory|smtp|resend` et `PUSH_MODE` vaut `mock|live`. `test` impose `LLM_MODE=mock`, `STRIPE_MODE=mock`, `EMAIL_MODE=memory` et `PUSH_MODE=mock` ; une combinaison incompatible est rejetée.
- **EF-4** — `ENABLE_SDD_PAGES` n'est activé que par la chaîne exacte `true`, et reste refusé en production (SPEC-001, SPEC-006). Corriger `.env.example` pour `ENABLE_SDD_PAGES=true` : la valeur actuelle `1` contredit le garde déjà spécifié. Un test compare l'exemple au schéma et au comportement réel de `sddPagesEnabled`.
- **EF-5** — `product.ts` expose les défauts, seuils et bornes des règles métier sous des noms stables : compte/rythme, apports, quiz, mémorisation, notifications, formation et groupe. Pour chaque constante, un commentaire renvoie à son identifiant `BR-*` ; un test de correspondance empêche de modifier une valeur normative sans mettre à jour la règle ou un ADR.
- **EF-6** — `models.ts` centralise les identifiants des modèles fournis et la correspondance tâche → modèle selon BR-IA-01 ; `pricing.ts` expose les tarifs USD par million de tokens, lecture cache et réduction lot de l'ADR-0073. Les tarifs sont des données de configuration et seront revérifiés avant SPEC-808.
- **EF-7** — La page `/_dev/sdd/SPEC-009` affiche les modes actifs, le nombre de variables publiques/serveur, les familles de constantes et les modèles par tâche ; elle masque toute valeur de secret. En cas de configuration invalide, elle affiche uniquement les noms de champs en erreur.
- **EF-8** — Les paramètres juridiques `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `LEGAL_CONTACT_EMAIL` et `LEGAL_HOST_NAME` restent des gabarits locaux vides ; leur absence bloque la production publique et n'est pas remplacée par une identité fictive.

## 6. Exigences techniques

- **ET-1** — `packages/config/src/env.ts` définit les schémas Zod `serverEnvSchema` et `publicEnvSchema`, ainsi que `parseServerEnv` et `parsePublicEnv`. L'appel de validation est centralisé au démarrage du web/worker ; aucun paquet ne relit directement `process.env` pour une variable métier en dehors de l'adaptateur de configuration.
- **ET-2** — Les clés sont validées sur leur forme sans journalisation : URL HTTP locale ou HTTPS hors local, chaîne non vide pour les secrets, clé de chiffrement base64 correspondant à 32 octets, fuseau et région attendus. Les erreurs Zod sont converties en noms de variables et codes sûrs.
- **ET-3** — En `production`, exiger `NEXT_PUBLIC_APP_URL` HTTPS, Supabase URL/anon/service, `DATABASE_URL`, `APP_ENCRYPTION_KEY`, Inngest event/signing, `ANTHROPIC_API_KEY` pour l'IA fournie, `VOYAGE_API_KEY`, `RESEND_API_KEY`, VAPID, Stripe, Sentry si activé, et les champs légaux. Les modes `mock` sont interdits en production pour IA, paiement, e-mail et push.
- **ET-4** — `packages/config/src/product.ts` est organisé par domaine et exporte des objets `as const`. Les valeurs ne sont pas dispersées dans les composants, services ou jobs. `models.ts` et `pricing.ts` sont importables côté serveur ; aucun tarif ni secret ne dépend d'un appel réseau au chargement du module.
- **ET-5** — `.env.example` reste versionné sans secret ; `.env.local` et toute variante réelle sont ignorés par Git. Les tests vérifient la liste des clés sans tenter de lire les valeurs confidentielles du poste.
- **ET-6** — `packages/config/src/index.ts` expose les entrées sûres ; les exports serveur passent par une sous-entrée `@learny/config/server` pour empêcher leur import accidentel par un composant client. Le lint de frontière de SPEC-001 refuse l'import de cette sous-entrée côté client.

## 7. Comportements attendus et cas limites

- **CL-1** — Plusieurs variables obligatoires absentes : une seule erreur énumère tous leurs noms, jamais leurs valeurs.
- **CL-2** — Clé de chiffrement base64 de 31 ou 33 octets : échec au démarrage ; aucun repli générant une nouvelle clé.
- **CL-3** — `APP_ENV=test` avec `LLM_MODE=live` ou `STRIPE_MODE=live` : rejet avant initialisation des fournisseurs.
- **CL-4** — `APP_ENV=production` avec `ENABLE_SDD_PAGES=true` : rejet, même si les autres variables sont valides.
- **CL-5** — `NEXT_PUBLIC_APP_URL` en HTTP hors local : rejet ; en `local`, `http://localhost:3000` est admis.
- **CL-6** — `.env.example` contient `ENABLE_SDD_PAGES=1` ou une clé inconnue du schéma : test de cohérence en échec.
- **CL-7** — Secret fourni avec espaces autour : ne pas l'afficher dans l'erreur ; normalisation limitée aux valeurs documentées, sans altérer une clé d'API.
- **CL-8** — Tarifs d'ADR-0073 non revérifiés : la configuration de test reste déterministe ; SPEC-808 signale cette vérification de production.

## 8. Instructions d'implémentation

1. Écrire les schémas et les fonctions de parsing dans `packages/config/src/env.ts` ; répertorier les variables depuis `.env.example`, puis corriger `ENABLE_SDD_PAGES` à `true`. Commit `feat(SPEC-009): valide les variables d'environnement`.
2. Séparer les exports publics et serveur, brancher la validation sur les points de démarrage du web et du worker ; tester qu'un import client ne peut pas atteindre les secrets. Commit `feat(SPEC-009): isole la configuration serveur`.
3. Créer `product.ts` à partir des valeurs de `business-rules.md` avec références BR, puis `models.ts` et `pricing.ts` selon les ADR et `ai.md`. Commit `feat(SPEC-009): centralise les constantes produit et IA`.
4. Créer la page SDD et les tests unitaires, d'intégration et e2e/visuels de la section 12. Commit `test(SPEC-009): vérifie modes secrets et exemple`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-009` et consigner chaque CA avec ses rapports réels.

## 9. Fichiers et composants concernés

- **Créés** : `packages/config/src/env.ts`, `packages/config/src/env-shared.ts`, `packages/config/src/env-public.ts`, `packages/config/src/server.ts`, `packages/config/src/env.test.ts`, `packages/config/src/product.ts`, `packages/config/src/product.test.ts`, `packages/config/src/models.ts`, `packages/config/src/pricing.ts`, `packages/config/test/integration/startup.test.ts`, `apps/web/lib/server-env.ts`, `apps/web/lib/sdd-config-demo.ts`, `apps/web/components/sdd-demos/spec-009.tsx`, `apps/web/e2e/specs/p0/spec-009.spec.ts`, `apps/web/test/integration/config-startup.test.ts`.
- **Modifiés** : `.env.example`, `packages/config/src/index.ts`, `packages/config/package.json` (export serveur), `packages/config/tsconfig.json`, points de démarrage de `apps/web` (`instrumentation.ts`) et `apps/worker` (`main`), lint de frontière `eslint.config.mjs`, `apps/web/app/%5Fdev/sdd/registry.ts` et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `sddPagesEnabled` de SPEC-001, `HOSTING_REGIONS`, `docs/product/business-rules.md`, `docs/architecture/ai.md`.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-009` présente `h1` « Configuration », puis les sections « Environnement », « Modes », « Variables publiques », « Modèles par tâche » et « Constantes produit ». Le premier bloc indique `local`, `test` ou `preview`, jamais `production` puisque la route SDD y est interdite. Les secrets sont représentés uniquement par « configuré »/« absent », sans quatre derniers caractères. Les libellés et messages français proviennent de `fr.ts`. Les régions portent `data-testid` `spec-009-environment`, `spec-009-modes`, `spec-009-public` et `spec-009-models`. À 390 px, les tableaux sont scrollables dans une région nommée. Vérifier jetons, ordre, axe, et captures desktop/mobile avec `toHaveScreenshot(..., { maxDiffPixelRatio: 0.01 })`.

## 11. Critères d'acceptation

- **CA-1** — Les quatre modes de service et les valeurs d'`APP_ENV` sont validés ; une combinaison de test réelle est refusée avant tout appel externe.
- **CA-2** — L'absence d'une variable obligatoire de production empêche le démarrage et ne révèle aucune valeur de secret ; l'objet public ne contient aucun nom serveur.
- **CA-3** — `.env.example` et les schémas contiennent les mêmes clés documentées, avec `ENABLE_SDD_PAGES=true` accepté par le garde.
- **CA-4** — Les constantes produit reprennent les valeurs des règles BR, les modèles de `ai.md` et les tarifs de l'ADR-0073 ; une divergence fait échouer les tests.
- **CA-5** — La page SDD n'affiche aucune valeur de secret, passe axe, vidéo et capture visuelle desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/config/src/env.test.ts`, `describe('[SPEC-009] environment')` : table des modes, URL, clé de 32 octets, exposition publique et production incomplète (CA-1, CA-2). `product.test.ts` vérifie chaque valeur normative et modèles/tarifs (CA-4).
- **Intégration** — `packages/config/test/integration/startup.test.ts`, `describe('[SPEC-009] startup')` : démarrer le web/worker avec jeu de variables local et production tronquée, vérifier sortie sûre ; comparer clés de `.env.example` au schéma et appeler `sddPagesEnabled` avec la valeur d'exemple (CA-1 à CA-3).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-009.spec.ts`, `test('inspecte la configuration @SPEC-009')` : ouvrir la page, vérifier modes et modèles, chercher l'absence de valeurs sensibles dans le HTML, conserver la vidéo (CA-5).
- **Visuel** — `test('configuration conforme @SPEC-009 @visual')` : ordre des sections, `expectTokens`, axe et captures desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les tests `[SPEC-001]`, `[SPEC-006]` et `@SPEC-006`.

| Critère | Tests |
|---|---|
| CA-1 | `env.test.ts` ; `startup.test.ts` |
| CA-2 | `env.test.ts` ; `startup.test.ts` |
| CA-3 | `startup.test.ts` |
| CA-4 | `product.test.ts` |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-009/` contient les rapports Vitest, Playwright, vidéo et captures, une sortie d'erreur de production expurgée et `acceptance.md` dont chaque CA cite un test. Aucun fichier d'environnement réel ni valeur de clé n'entre dans les preuves.

## 14. Définition de terminé

Toutes les conditions de `docs/engineering/testing.md` §7 passent. Le test d'égalité des clés de `.env.example` et des schémas est vert, la valeur `ENABLE_SDD_PAGES=true` est cohérente avec SPEC-001/006, et un démarrage production incomplet échoue explicitement. Les tarifs restent des paramètres à revérifier avant SPEC-808.

## 15. Décisions et hypothèses

ADR-0011 fixe l'accès à l'IA fournie, ADR-0045 l'identité légale et ADR-0073 les tarifs de référence. Les constantes de `product.ts` sont des miroirs des règles métier et ne créent pas de nouvelles bornes. La correction de l'exemple SDD aligne le dépôt sur la valeur déjà imposée par SPEC-001, SPEC-006 et ADR-0049.

Décisions prises pendant l'implémentation (aucune sollicitation de l'utilisateur) :

- **ADR-0227** — politique de validation de l'environnement : listes de clés (serveur, publiques, outillage, standard), Sentry facultatif, erreurs réduites à des noms et codes sûrs, normalisation limitée aux énumérations, modes simulés interdits en production, `ENABLE_SDD_PAGES` activé par la seule chaîne `true`, `TZ` IANA.
- **ADR-0228** — frontière client/serveur : sous-entrée `@learny/config/server`, adaptateur unique `apps/web/lib/server-env.ts`, lint `no-restricted-imports` et test de scan des sources, validation au démarrage (`instrumentation.ts`, `main()` du worker) ; le cas production de SPEC-006 vérifie désormais le refus de démarrage.
- **ADR-0229** — tarifs : écriture de cache à 125 % de l'entrée et effort de réflexion par tâche, en complément d'ADR-0073.
