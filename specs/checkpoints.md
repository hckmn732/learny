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
