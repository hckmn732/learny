# Checkpoints de fin de phase

Un checkpoint s'exécute quand toutes les spécifications de la phase sont `done` : `node tools/sdd/checkpoint.mjs CP-n`. Il rejoue l'audit, lint, typecheck, build, tests unitaires avec couverture, intégration, e2e complets (non-régression), puis vérifie les critères ci-dessous. La phase suivante n'est exécutable qu'après réussite (verrou dans `tools/sdd/lib.mjs`). En cas d'échec : l'agent ouvre une branche `fix/<SPEC>-<slug>` rattachée à la spécification fautive, corrige, puis relance le checkpoint. Un rapport est écrit dans `evidence/checkpoints/CP-n/summary.md` ; en cas de réussite, tags `cp-n` et `v0.<n>.0` (CP-8 : `v1.0.0`, CP-9 : `v2.0.0`).

## CP-0

Fondations et infrastructure (P0).
- `pnpm dev:up` démarre Supabase local, Inngest Dev Server et Mailpit ; `/api/v1/health` répond `ok` avec la base connectée.
- Hooks Git actifs (un commit mal formé est refusé) ; CI valide (actionlint) ; images Docker construites.
- `node tools/sdd/next.mjs`, `validate.mjs`, `status.mjs`, `audit.mjs` fonctionnent ; les preuves de SPEC-001 à 013 existent.
- Références visuelles des 14 maquettes générées dans `design/references/`.

## CP-1

Base de données (P1).
- Toutes les tables de `docs/architecture/data-model.md` existent ; `pnpm db:reset` passe sans erreur.
- RLS activée sur 100 % des tables `public` (requête de contrôle dans le test) ; tests d'isolation verts pour chaque table.
- `pnpm db:seed:demo` reproduit les données des maquettes (contrôles de comptage du test SPEC-115).

## CP-2

Backend et services (P2).
- Inscription par lien magique et par mot de passe fonctionnelle de bout en bout avec Mailpit.
- Un événement de démonstration traverse Inngest (étapes, reprise) ; e-mail et Web Push simulés envoyés en respectant heures calmes et plafond.
- Export ZIP et cycle de suppression J+30 vérifiés avec horloge figée ; OpenAPI généré.

## CP-3

Interface (P3).
- Galerie `/_dev/ui` complète, sans violation axe serious/critical.
- Coquille (menu, en-tête, notifications, recherche) conforme à `Main.dc.html` (contrôles visuels réussis, écart ≤ 12 %).

## CP-4

Moteur d'apprentissage (P4).
- Couverture ≥ 80 % des lignes de `packages/learning-engine` ; tests par propriétés verts.
- Scénario de référence (SAP, 2 nov. → 11 déc.) : le planificateur produit l'agenda attendu par le test de SPEC-407 ; FSRS, maîtrise et lacunes conformes aux cas tabulés.

## CP-5

IA et ingestion (P5).
- En mode mock : chaque tâche IA produit des briques valides ; une brique invalide est corrigée ou fait échouer la tâche selon ADR-0013 ; tests d'injection verts.
- Ingestion d'un PDF, d'une page web, d'une vidéo YouTube et d'une image de test → passages et embeddings ; recherche sémantique pertinente sur le jeu de test.
- Plafond IA : bascule Haiku et alerte 80 % démontrées.

## CP-6

Parcours d'apprentissage (P6).
- Parcours e2e complet : inscription → premiers pas → nouvelle formation → programme validé → apports → cours → discussion → quiz échoué → remédiation → quiz réussi → module 2 ouvert → exercice → examen blanc → lacunes → carte → bilan final (formation courte de test).
- Écrans SCR-01 à SCR-14 et SCR-16 conformes (contrôles visuels).
- Cross-browser (Chromium, Firefox, WebKit) vert sur les parcours principaux.

## CP-7

Engagement (P7).
- Quiz global avec les 5 jeux et la micro-séance ; agenda (3 vues, déplacement, réajustement) ; centre de notifications et préférences ; les 10 automatismes démontrés avec horloge figée (déclenchement, journal, annulation, accord).
- Paramètres (4 onglets) conformes ; formations à plusieurs (invitation, visibilité, départ) ; abonnement Stripe en mode test.

## CP-8

Livraison V1 (P8).
- PWA installable et révisions hors ligne démontrées ; responsive 360 → 1920 px ; axe sans violation sur toutes les pages ; budgets de performance tenus (`pnpm test:perf`) ; audit de sécurité sans faille haute ; pages légales.
- Suite e2e complète (non-régression) verte sur 3 navigateurs ; checklist de mise en production complétée ou blocages externes consignés dans `progress/blockers.md`.
- Tag `v1.0.0`.

## CP-9

Livraison V2 (P9).
- Fonctions V2 (audio, vidéo, liens, explique à un débutant, mises en situation, projet fil rouge, baisse d'engagement) démontrées ; non-régression V1 complète.
- Tag `v2.0.0`.

# Piste « migration » (ADR-1006)

Phases P10 → P13 sur la branche `migration`, indépendantes de la piste produit sauf P12 qui exige CP-8. Tags `cp-10` … `cp-13` uniquement (pas de version SemVer). Avant chaque checkpoint : `node tools/sdd/sync-main.mjs`. **Invariant commun à tous les checkpoints de la piste : aucune assertion de test existante modifiée, aucune ligne de base visuelle régénérée** (ADR-1001 §4).

## CP-10

Préparation, couche HTTP et paquets partagés (P10).
- CI verte sur `migration`, aucun déploiement déclenché par la branche ; `sync-main.mjs` résout un conflit de suivi et s'arrête sur un conflit de code.
- `@learny/api-client`, `@learny/domain`, `@learny/i18n` passent le contrôle de portabilité ; `@learny/http` n'importe pas `next`.
- `ROUTE_IMPLEMENTATIONS` couvre 100 % du registre `ROUTES` ; `pnpm migration:routes:check` passe ; aucun fichier `route.ts` ne contient de logique.
- `pnpm migration:report` : le couplage du web n'a pas augmenté depuis le démarrage de la piste ; suite e2e complète verte.

## CP-11

Application API autonome (P11).
- `apps/api` sert 100 % des routes et gestionnaires spéciaux, `/api/inngest` et `/health` ; les suites paramétrées passent pour `next` et `hono`.
- Authentification par cookie et par Bearer avec vérification locale (0 appel au serveur d'authentification pour une lecture) ; mutations relayées acceptées seulement avec le secret de proxy.
- L'ancien serveur Worker est supprimé ; image `api` construite et saine en auto-hébergé ; `deploy:check --dry-run` vert.

## CP-12

Bascule du web sur l'API (P12, exige CP-8).
- `apps/web` ne contient plus de route `/api`, n'importe aucun paquet serveur et n'en déclare aucun en `dependencies` ; `pnpm migration:report` = 0.
- Suite e2e complète **et** cross-browser vertes au travers du relai ; flux SSE, cookies d'authentification et webhook Stripe simulé vérifiés.
- `pnpm test:perf` : budgets ADR-0041/ADR-0332 tenus, surcoût médian du rendu serveur ≤ 25 ms par page (ADR-1003).

## CP-13

API multi-clients et clôture (P13).
- OpenAPI valide avec schémas de sécurité ; client natif simulé réussi sans cookie ni `Origin` ; CORS limité aux origines déclarées.
- Aucun code de transition ; documentation et guide d'exploitation à jour ; `report.mjs --check` actif dans `pnpm lint`.
- Suite e2e complète, cross-browser et performances vertes. Après réussite : fusion de `migration` dans `main` par l'agent principal, `activeTrack` remis à `"produit"` dans le commit de fusion (ADR-1006 §9).

# Migration Python headless (piste `python-migration`, ADR-2001)

Piste unique active, partie de `main`, sans dépendance à une autre piste. Les pistes `produit` et `migration` (Hono) sont gelées.

## CP-20

Inventaire, contrat et socle (SPEC-2001, SPEC-2002, SPEC-2003).
- Inventaire de 217 opérations, des SSE, webhooks, événements et tâches complet ; oracles rejouables ; carte de portage des tests.
- `api/openapi.yaml` source unique, SDK généré, contrôle de dérive et de compatibilité en CI.
- Façade FastAPI relayant tout vers Hono ; suite e2e et visuelle complète verte via la façade ; `validate.mjs` exécute pytest.

## CP-21

Données, identité et worker (SPEC-2101, SPEC-2102).
- Matrice RLS complète rejouée sous Python ; JWT cookie et Bearer vérifiés ; rôle de service restreint.
- Worker et outbox : crash, concurrence et doublons sans double effet ; planificateur singleton.

## CP-22

Domaines métier (SPEC-2201, SPEC-2202, SPEC-2203, SPEC-2204, SPEC-2205, SPEC-2207, SPEC-2206).
- Toutes les entrées de `api/ownership.yaml` (opérations, routes spéciales, consommateurs, crons) sont à `py` ; la façade ne relaie plus rien ; matrices de parité sans divergence inexpliquée.
- Tous les consommateurs tournent sur le worker Python (SPEC-2207) ; Hono tourne sans Inngest.
- Tous les tests TypeScript backend ont un équivalent pytest vert ; suite e2e, visuelle et cross-browser verte via Python.

## CP-23

Bascule et retrait (SPEC-2301, SPEC-2302).
- Production servie par Python sur Coolify ; rollback et restauration exercés sur le staging fourni ; budgets d'ADR-0041 mesurés.
- `apps/api` Hono, Inngest et paquets backend TypeScript retirés ; inventaire final sans chemin résiduel ; suite complète, cross-browser et performances vertes.

## CP-30

Mobile — socle (SPEC-3001, SPEC-3002, SPEC-3003). Piste `mobile`, branche `mobile` (ADR-3001).
- `apps/mobile` démarre sur Android et iOS ; `validate.mjs` exécute Jest et Maestro (vidéo, comparaison visuelle) pour les spécifications de la piste, sans changer les autres pistes.
- Thème, polices, icônes et composants natifs dans la galerie `/_dev/ui`, contrastes AA et cibles vérifiés.
- Bearer, renouvellement unique, flux SSE via `expo/fetch`, session chiffrée et cache persistant prouvés contre l'API locale.
- `P23-plan.md` tient compte des imports de `apps/mobile` (ADR-3005) et le commit est rapatrié sur `main`.

## CP-31

Mobile — accès et coquille (SPEC-3101, SPEC-3102).
- Connexion par mot de passe et par lien magique ouvert dans l'application, inscription avec case CGU, déconnexion et purge.
- Cinq onglets natifs avec une pile chacun, centre de notifications, feuille compte, garde d'onboarding, états communs et renvois au web.

## CP-32

Mobile — quotidien (SPEC-3201, SPEC-3202, SPEC-3203).
- Aujourd'hui, Programme (Modules et Calendrier) et Agenda (Jour, Semaine, Mois) affichent exactement les données de démonstration du 11 novembre 2026 à 13:20 et sont conformes aux exports de `design/app-mobile/` (écart ≤ 12 % hors zones natives).
- Actions du tuteur, report et replanification de séance visibles dans les trois écrans.

## CP-33

Mobile — apprentissage (SPEC-3301 à SPEC-3305).
- Registre natif couvrant les treize types de briques ; cours lu avec progression enregistrée ; tuteur en flux avec sources, historique et interruption gérée.
- Quiz de validation conforme à BR-QUI-04 et BR-QUI-07 (« Vérifier », aucun chronomètre) jusqu'au résultat ; quiz global et échauffement jouables, y compris hors ligne avec synchronisation sans doublon.
- Non-régression web `@SPEC-611`, `@SPEC-701`, `@SPEC-801` verte.

## CP-34

Mobile — compte (SPEC-3401, SPEC-3402).
- Profil et réglages enregistrés et relus sur le web ; pause, export, suppression et annulation fonctionnels ; aucun achat ni portail d'abonnement (ADR-3006).
- Apple et Google proposés ensemble, première connexion soumise aux CGU (identifiants réels ou blocage `--external` consigné).

## CP-35

Mobile — notifications et publication (SPEC-3501, SPEC-3502). Exige CP-23 (backend Python).
- Canaux push natifs APNs et FCM dans le worker Python, soumis aux préférences, heures calmes et plafond ; contrat compatible ; aucune régression Web Push.
- Parcours de bout en bout Android et iOS, audit d'accessibilité sans anomalie bloquante, budgets mobiles mesurés, builds de production signés en test interne (ou blocage `--external`).
- La fusion de `mobile` dans `main` est déjà faite (branche unique, ADR-4004).

## CP-40

Mode simple, lot 1 (SPEC-4001, SPEC-4002, SPEC-4003), piste `mode-simple` (ADR-4001).
- Contrat et backend : parcours complet en mock prouvé, refus sans clé d'IA, RLS, aucune régression de SPEC-605, SPEC-607, SPEC-608 et SPEC-611.
- Web et mobile (Android et iOS) : parcours de bout en bout filmés, conformité aux maquettes `design/mode-simple/`, axe et lecteurs d'écran sans anomalie bloquante.
- Parité web et mobile prouvée (ADR-4002) : mêmes `testID`, mêmes opérations d'API pour le même parcours.
