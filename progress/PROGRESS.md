# Progression du projet Learny

> Généré par `node tools/sdd/status.mjs` le 2026-11-12T18:50:13.437Z. Ne pas éditer à la main.

## Synthèse

| Indicateur | Valeur |
|---|---|
| Spécifications | 132 (V1 : 124, V2 : 8) |
| Terminées | 48 |
| En cours | 0 |
| Prêtes | 1 |
| En attente de dépendances | 83 |
| Bloquées | 0 |
| Bloquées par une dépendance | 0 |
| **Avancement global** | **36.4 %** |
| Avancement V1 | 38.7 % |
| Prochaine action | start SPEC-307 — Recherche globale : interface |

## Phases et checkpoints

| Phase | Titre | Terminées | Checkpoint | Statut |
|---|---|---|---|---|
| P0 | Fondations et infrastructure | 13/13 | CP-0 | ✅ 2026-11-11 cp-0 v0.0.0 |
| P1 | Base de données, migrations et sécurité | 15/15 | CP-1 | ✅ 2026-11-12 cp-1 v0.1.0 |
| P2 | Backend, API et services transverses | 12/12 | CP-2 | ✅ 2026-11-12 cp-2 v0.2.0 |
| P3 | Design system et coquille de l'application | 8/9 | CP-3 | ⏳ |
| P4 | Moteur d'apprentissage (déterministe) | 0/11 | CP-4 | ⏳ |
| P5 | IA, ingestion et briques | 0/13 | CP-5 | ⏳ |
| P6 | Parcours d'apprentissage (fonctionnalités cœur) | 0/18 | CP-6 | ⏳ |
| P7 | Révisions, agenda, engagement et réglages | 0/25 | CP-7 | ⏳ |
| P8 | Plateforme, qualité et livraison V1 | 0/8 | CP-8 | ⏳ |
| P9 | Fonctionnalités V2 et livraison V2 | 0/8 | CP-9 | ⏳ |

## Détail des spécifications

| Spécification | Titre | Phase | Statut | Tentatives | Validations | Dépendances |
|---|---|---|---|---|---|---|
| [SPEC-001](../specs/p0-fondations/SPEC-001-monorepo-application-web-minimale-et-socle-de-test.md) | Monorepo, application web minimale et socle de tests | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | — |
| [SPEC-002](../specs/p0-fondations/SPEC-002-hooks-git-conventions-de-commit-et-protection-des-.md) | Hooks Git, conventions de commit et protection des secrets | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-001 |
| [SPEC-003](../specs/p0-fondations/SPEC-003-outillage-sdd-executable-et-integre.md) | Outillage SDD exécutable et intégré | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-001 |
| [SPEC-004](../specs/p0-fondations/SPEC-004-socle-de-tests-complet-et-collecte-des-preuves.md) | Socle de tests complet et collecte des preuves | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-001, SPEC-003 |
| [SPEC-005](../specs/p0-fondations/SPEC-005-references-visuelles-generees-depuis-les-maquettes.md) | Références visuelles générées depuis les maquettes | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-004 |
| [SPEC-006](../specs/p0-fondations/SPEC-006-application-web-configuration-de-base-sante-et-pag.md) | Application web : configuration de base, santé et pages de démonstration | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-001 |
| [SPEC-007](../specs/p0-fondations/SPEC-007-worker-inngest-et-paquet-jobs.md) | Worker Inngest et paquet jobs | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-001 |
| [SPEC-008](../specs/p0-fondations/SPEC-008-environnement-local-docker.md) | Environnement local Docker | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-006, SPEC-007 |
| [SPEC-009](../specs/p0-fondations/SPEC-009-configuration-variables-d-environnement-et-secrets.md) | Configuration, variables d'environnement et secrets | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-006 |
| [SPEC-010](../specs/p0-fondations/SPEC-010-observabilite-journalisation-erreurs-sante.md) | Observabilité : journalisation, erreurs, santé | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-006, SPEC-009 |
| [SPEC-011](../specs/p0-fondations/SPEC-011-integration-continue.md) | Intégration continue | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-002, SPEC-004, SPEC-008 |
| [SPEC-012](../specs/p0-fondations/SPEC-012-images-docker-et-deploiement-auto-heberge.md) | Images Docker et déploiement auto-hébergé | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-007, SPEC-008 |
| [SPEC-013](../specs/p0-fondations/SPEC-013-environnements-geres-et-deploiement-continu.md) | Environnements gérés et déploiement continu | P0 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-009, SPEC-011 |
| [SPEC-101](../specs/p1-donnees/SPEC-101-paquet-db-drizzle-migrations-et-harnais-de-test.md) | Paquet db : Drizzle, migrations et harnais de test | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-008 |
| [SPEC-102](../specs/p1-donnees/SPEC-102-schema-identite-et-preferences.md) | Schéma identité et préférences | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-101 |
| [SPEC-103](../specs/p1-donnees/SPEC-103-schema-formations-programme-et-notions.md) | Schéma formations, programme et notions | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-102 |
| [SPEC-104](../specs/p1-donnees/SPEC-104-schema-ressources-et-passages-vectoriels.md) | Schéma ressources et passages vectoriels | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-103 |
| [SPEC-105](../specs/p1-donnees/SPEC-105-schema-cours-et-discussions.md) | Schéma cours et discussions | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-104 |
| [SPEC-106](../specs/p1-donnees/SPEC-106-schema-briques-activites-et-tentatives.md) | Schéma briques, activités et tentatives | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-103 |
| [SPEC-107](../specs/p1-donnees/SPEC-107-schema-memorisation-et-lacunes.md) | Schéma mémorisation et lacunes | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-106 |
| [SPEC-108](../specs/p1-donnees/SPEC-108-schema-agenda-automatismes-et-serie.md) | Schéma agenda, automatismes et série | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-102, SPEC-103 |
| [SPEC-109](../specs/p1-donnees/SPEC-109-schema-notifications.md) | Schéma notifications | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-102 |
| [SPEC-110](../specs/p1-donnees/SPEC-110-schema-ia-et-facturation.md) | Schéma IA et facturation | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-102 |
| [SPEC-111](../specs/p1-donnees/SPEC-111-schema-formations-a-plusieurs.md) | Schéma formations à plusieurs | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-103 |
| [SPEC-112](../specs/p1-donnees/SPEC-112-schema-donnees-personnelles-idempotence-et-recherc.md) | Schéma données personnelles, idempotence et recherche | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-105, SPEC-103 |
| [SPEC-113](../specs/p1-donnees/SPEC-113-politiques-rls-et-tests-d-isolation.md) | Politiques RLS et tests d'isolation | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-102, SPEC-103, SPEC-104, SPEC-105, SPEC-106, SPEC-107, SPEC-108, SPEC-109, SPEC-110, SPEC-111, SPEC-112 |
| [SPEC-114](../specs/p1-donnees/SPEC-114-stockage-des-fichiers.md) | Stockage des fichiers | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-104, SPEC-113 |
| [SPEC-115](../specs/p1-donnees/SPEC-115-jeu-de-donnees-de-demonstration-et-fabriques.md) | Jeu de données de démonstration et fabriques | P1 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-113 |
| [SPEC-201](../specs/p2-backend/SPEC-201-socle-api-v1-et-contrats.md) | Socle API v1 et contrats | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-006, SPEC-101 |
| [SPEC-202](../specs/p2-backend/SPEC-202-authentification-et-sessions.md) | Authentification et sessions | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-201, SPEC-102 |
| [SPEC-203](../specs/p2-backend/SPEC-203-evenements-de-domaine-jobs-et-crons.md) | Événements de domaine, jobs et crons | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-007, SPEC-201 |
| [SPEC-204](../specs/p2-backend/SPEC-204-service-e-mail-et-gabarits.md) | Service e-mail et gabarits | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-203, SPEC-009 |
| [SPEC-205](../specs/p2-backend/SPEC-205-notifications-navigateur-web-push.md) | Notifications navigateur (Web Push) | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-203, SPEC-109 |
| [SPEC-206](../specs/p2-backend/SPEC-206-service-de-fichiers-et-envois.md) | Service de fichiers et envois | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-114, SPEC-201 |
| [SPEC-207](../specs/p2-backend/SPEC-207-horloge-fuseaux-et-heures-calmes.md) | Horloge, fuseaux et heures calmes | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-101 |
| [SPEC-208](../specs/p2-backend/SPEC-208-limitation-de-debit-et-protections-de-l-api.md) | Limitation de débit et protections de l'API | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-201 |
| [SPEC-209](../specs/p2-backend/SPEC-209-service-unifie-de-notifications.md) | Service unifié de notifications | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-204, SPEC-205, SPEC-207, SPEC-109 |
| [SPEC-210](../specs/p2-backend/SPEC-210-abonnement-stripe-service.md) | Abonnement Stripe (service) | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-201, SPEC-110 |
| [SPEC-211](../specs/p2-backend/SPEC-211-export-des-donnees-et-suppression-du-compte.md) | Export des données et suppression du compte | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-203, SPEC-112, SPEC-206, SPEC-204, SPEC-209 |
| [SPEC-212](../specs/p2-backend/SPEC-212-recherche-globale-service-et-api.md) | Recherche globale (service et API) | P2 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-112, SPEC-201 |
| [SPEC-301](../specs/p3-interface/SPEC-301-jetons-de-design-et-theme.md) | Jetons de design et thème | P3 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-006, SPEC-005 |
| [SPEC-302](../specs/p3-interface/SPEC-302-composants-de-base-i-actions-et-saisie.md) | Composants de base I : actions et saisie | P3 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-301 |
| [SPEC-303](../specs/p3-interface/SPEC-303-composants-de-base-ii-structure-et-retours.md) | Composants de base II : structure et retours | P3 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-302 |
| [SPEC-304](../specs/p3-interface/SPEC-304-coquille-menu-lateral.md) | Coquille : menu latéral | P3 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-303, SPEC-202 |
| [SPEC-305](../specs/p3-interface/SPEC-305-coquille-en-tete-fige-et-menu-mon-compte.md) | Coquille : en-tête figé et menu Mon compte | P3 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-304 |
| [SPEC-306](../specs/p3-interface/SPEC-306-panneau-des-notifications.md) | Panneau des notifications | P3 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-305, SPEC-209 |
| [SPEC-307](../specs/p3-interface/SPEC-307-recherche-globale-interface.md) | Recherche globale : interface | P3 | 🟢 ready | 0 | — | SPEC-305, SPEC-212 |
| [SPEC-308](../specs/p3-interface/SPEC-308-pages-systeme-et-mise-en-page-d-authentification.md) | Pages système et mise en page d'authentification | P3 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-303 |
| [SPEC-309](../specs/p3-interface/SPEC-309-socle-d-accessibilite.md) | Socle d'accessibilité | P3 | ✅ done | 0 | ✓lint ✓typecheck ✓build ✓unit ✓integration ✓e2e ✓visual ✓acceptance | SPEC-303 |
| [SPEC-401](../specs/p4-moteur/SPEC-401-paquet-learning-engine-structure-et-types.md) | Paquet learning-engine : structure et types | P4 | ⏳ waiting | 0 | — | SPEC-001, SPEC-004 |
| [SPEC-402](../specs/p4-moteur/SPEC-402-repetition-espacee-fsrs-par-notion.md) | Répétition espacée FSRS par notion | P4 | ⏳ waiting | 0 | — | SPEC-401 |
| [SPEC-403](../specs/p4-moteur/SPEC-403-calcul-de-la-maitrise.md) | Calcul de la maîtrise | P4 | ⏳ waiting | 0 | — | SPEC-401 |
| [SPEC-404](../specs/p4-moteur/SPEC-404-detection-nature-et-levee-des-lacunes.md) | Détection, nature et levée des lacunes | P4 | ⏳ waiting | 0 | — | SPEC-402, SPEC-403 |
| [SPEC-405](../specs/p4-moteur/SPEC-405-tirage-des-questions-d-une-tentative.md) | Tirage des questions d'une tentative | P4 | ⏳ waiting | 0 | — | SPEC-404 |
| [SPEC-406](../specs/p4-moteur/SPEC-406-tirage-de-la-session-de-quiz-global.md) | Tirage de la session de quiz global | P4 | ⏳ waiting | 0 | — | SPEC-402, SPEC-404 |
| [SPEC-407](../specs/p4-moteur/SPEC-407-planificateur.md) | Planificateur | P4 | ⏳ waiting | 0 | — | SPEC-401 |
| [SPEC-408](../specs/p4-moteur/SPEC-408-retention-et-indicateurs-de-progression.md) | Rétention et indicateurs de progression | P4 | ⏳ waiting | 0 | — | SPEC-402 |
| [SPEC-409](../specs/p4-moteur/SPEC-409-serie-et-jalons.md) | Série et jalons | P4 | ⏳ waiting | 0 | — | SPEC-401 |
| [SPEC-410](../specs/p4-moteur/SPEC-410-selection-de-l-echauffement.md) | Sélection de l'échauffement | P4 | ⏳ waiting | 0 | — | SPEC-402, SPEC-404 |
| [SPEC-411](../specs/p4-moteur/SPEC-411-services-de-persistance-du-moteur.md) | Services de persistance du moteur | P4 | ⏳ waiting | 0 | — | SPEC-402, SPEC-403, SPEC-404, SPEC-405, SPEC-406, SPEC-407, SPEC-408, SPEC-409, SPEC-410, SPEC-107, SPEC-108 |
| [SPEC-501](../specs/p5-ia/SPEC-501-paquet-bricks-registre-schemas-et-validation.md) | Paquet bricks : registre, schémas et validation | P5 | ⏳ waiting | 0 | — | SPEC-106 |
| [SPEC-502](../specs/p5-ia/SPEC-502-correction-automatique-des-briques.md) | Correction automatique des briques | P5 | ⏳ waiting | 0 | — | SPEC-501 |
| [SPEC-503](../specs/p5-ia/SPEC-503-rendu-des-briques.md) | Rendu des briques | P5 | ⏳ waiting | 0 | — | SPEC-501, SPEC-303 |
| [SPEC-504](../specs/p5-ia/SPEC-504-paquet-llm-fournisseurs-taches-et-modele-simule.md) | Paquet llm : fournisseurs, tâches et modèle simulé | P5 | ⏳ waiting | 0 | — | SPEC-110, SPEC-201, SPEC-009 |
| [SPEC-505](../specs/p5-ia/SPEC-505-cles-personnelles-chiffrees.md) | Clés personnelles chiffrées | P5 | ⏳ waiting | 0 | — | SPEC-504 |
| [SPEC-506](../specs/p5-ia/SPEC-506-qualification-des-modeles-personnels.md) | Qualification des modèles personnels | P5 | ⏳ waiting | 0 | — | SPEC-505, SPEC-501 |
| [SPEC-507](../specs/p5-ia/SPEC-507-garde-fou-de-cout-et-journal-des-appels.md) | Garde-fou de coût et journal des appels | P5 | ⏳ waiting | 0 | — | SPEC-504, SPEC-210 |
| [SPEC-508](../specs/p5-ia/SPEC-508-paquet-tutor-actions-boucle-et-consignes.md) | Paquet tutor : actions, boucle et consignes | P5 | ⏳ waiting | 0 | — | SPEC-501, SPEC-504, SPEC-411 |
| [SPEC-509](../specs/p5-ia/SPEC-509-ingestion-notes-et-pdf-decoupage-embeddings.md) | Ingestion : notes et PDF, découpage, embeddings | P5 | ⏳ waiting | 0 | — | SPEC-104, SPEC-203, SPEC-504, SPEC-206 |
| [SPEC-510](../specs/p5-ia/SPEC-510-ingestion-pages-web-youtube-et-images.md) | Ingestion : pages web, YouTube et images | P5 | ⏳ waiting | 0 | — | SPEC-509 |
| [SPEC-511](../specs/p5-ia/SPEC-511-recherche-semantique-et-selection-du-contexte.md) | Recherche sémantique et sélection du contexte | P5 | ⏳ waiting | 0 | — | SPEC-509 |
| [SPEC-512](../specs/p5-ia/SPEC-512-recherche-web.md) | Recherche web | P5 | ⏳ waiting | 0 | — | SPEC-504 |
| [SPEC-513](../specs/p5-ia/SPEC-513-banques-de-questions.md) | Banques de questions | P5 | ⏳ waiting | 0 | — | SPEC-508, SPEC-501, SPEC-511 |
| [SPEC-601](../specs/p6-parcours/SPEC-601-inscription-connexion-et-verification-de-l-e-mail.md) | Inscription, connexion et vérification de l'e-mail | P6 | ⏳ waiting | 0 | — | SPEC-202, SPEC-308, SPEC-302 |
| [SPEC-602](../specs/p6-parcours/SPEC-602-premiers-pas-onboarding.md) | Premiers pas (onboarding) | P6 | ⏳ waiting | 0 | — | SPEC-601, SPEC-505, SPEC-506, SPEC-205, SPEC-210 |
| [SPEC-603](../specs/p6-parcours/SPEC-603-accueil.md) | Accueil | P6 | ⏳ waiting | 0 | — | SPEC-304, SPEC-408, SPEC-115, SPEC-411 |
| [SPEC-604](../specs/p6-parcours/SPEC-604-nouvelle-formation-cadrage-par-chat.md) | Nouvelle formation : cadrage par chat | P6 | ⏳ waiting | 0 | — | SPEC-508, SPEC-304 |
| [SPEC-605](../specs/p6-parcours/SPEC-605-programme-propose-import-ajustement-et-validation.md) | Programme proposé, import, ajustement et validation | P6 | ⏳ waiting | 0 | — | SPEC-604, SPEC-512, SPEC-407 |
| [SPEC-606](../specs/p6-parcours/SPEC-606-programme-en-cours.md) | Programme en cours | P6 | ⏳ waiting | 0 | — | SPEC-605 |
| [SPEC-607](../specs/p6-parcours/SPEC-607-module-et-apports.md) | Module et apports | P6 | ⏳ waiting | 0 | — | SPEC-606, SPEC-509, SPEC-510, SPEC-512 |
| [SPEC-608](../specs/p6-parcours/SPEC-608-generation-du-cours.md) | Génération du cours | P6 | ⏳ waiting | 0 | — | SPEC-607, SPEC-511, SPEC-508, SPEC-513 |
| [SPEC-609](../specs/p6-parcours/SPEC-609-lecture-du-cours.md) | Lecture du cours | P6 | ⏳ waiting | 0 | — | SPEC-608, SPEC-503 |
| [SPEC-610](../specs/p6-parcours/SPEC-610-discussion-contextuelle-avec-le-tuteur.md) | Discussion contextuelle avec le tuteur | P6 | ⏳ waiting | 0 | — | SPEC-609, SPEC-511 |
| [SPEC-611](../specs/p6-parcours/SPEC-611-quiz-de-validation-passage.md) | Quiz de validation : passage | P6 | ⏳ waiting | 0 | — | SPEC-609, SPEC-405, SPEC-502, SPEC-503 |
| [SPEC-612](../specs/p6-parcours/SPEC-612-resultat-lacunes-remediation-et-deblocage.md) | Résultat, lacunes, remédiation et déblocage | P6 | ⏳ waiting | 0 | — | SPEC-611, SPEC-404 |
| [SPEC-613](../specs/p6-parcours/SPEC-613-exercice-pratique.md) | Exercice pratique | P6 | ⏳ waiting | 0 | — | SPEC-503, SPEC-508, SPEC-404 |
| [SPEC-614](../specs/p6-parcours/SPEC-614-examen-blanc.md) | Examen blanc | P6 | ⏳ waiting | 0 | — | SPEC-611, SPEC-407 |
| [SPEC-615](../specs/p6-parcours/SPEC-615-mes-lacunes.md) | Mes lacunes | P6 | ⏳ waiting | 0 | — | SPEC-404, SPEC-304, SPEC-411 |
| [SPEC-616](../specs/p6-parcours/SPEC-616-carte-des-notions.md) | Carte des notions | P6 | ⏳ waiting | 0 | — | SPEC-404, SPEC-304, SPEC-411 |
| [SPEC-617](../specs/p6-parcours/SPEC-617-bilan-final-et-entretien-de-memoire.md) | Bilan final et entretien de mémoire | P6 | ⏳ waiting | 0 | — | SPEC-612, SPEC-408 |
| [SPEC-618](../specs/p6-parcours/SPEC-618-gestion-des-formations-changer-pause-limite-de-tro.md) | Gestion des formations : changer, pause, limite de trois | P6 | ⏳ waiting | 0 | — | SPEC-603, SPEC-407 |
| [SPEC-701](../specs/p7-engagement/SPEC-701-quiz-global-session-du-jour-et-cartes-de-rappel.md) | Quiz global : session du jour et cartes de rappel | P7 | ⏳ waiting | 0 | — | SPEC-406, SPEC-503, SPEC-411, SPEC-513 |
| [SPEC-702](../specs/p7-engagement/SPEC-702-jeux-association-remise-en-ordre-classement-texte-.md) | Jeux : association, remise en ordre, classement, texte à trous | P7 | ⏳ waiting | 0 | — | SPEC-701 |
| [SPEC-703](../specs/p7-engagement/SPEC-703-micro-seance.md) | Micro-séance | P7 | ⏳ waiting | 0 | — | SPEC-701 |
| [SPEC-704](../specs/p7-engagement/SPEC-704-agenda-vues-filtres-et-detail.md) | Agenda : vues, filtres et détail | P7 | ⏳ waiting | 0 | — | SPEC-407, SPEC-304, SPEC-411 |
| [SPEC-705](../specs/p7-engagement/SPEC-705-agenda-deplacer-et-reajuster-le-planning.md) | Agenda : déplacer et réajuster le planning | P7 | ⏳ waiting | 0 | — | SPEC-704 |
| [SPEC-706](../specs/p7-engagement/SPEC-706-notifications-generation-des-rappels.md) | Notifications : génération des rappels | P7 | ⏳ waiting | 0 | — | SPEC-209, SPEC-306, SPEC-411 |
| [SPEC-707](../specs/p7-engagement/SPEC-707-parametres-onglets-et-profil.md) | Paramètres : onglets et Profil | P7 | ⏳ waiting | 0 | — | SPEC-304, SPEC-211 |
| [SPEC-708](../specs/p7-engagement/SPEC-708-parametres-notifications.md) | Paramètres : Notifications | P7 | ⏳ waiting | 0 | — | SPEC-707, SPEC-209 |
| [SPEC-709](../specs/p7-engagement/SPEC-709-parametres-modeles-d-ia.md) | Paramètres : Modèles d'IA | P7 | ⏳ waiting | 0 | — | SPEC-707, SPEC-506, SPEC-507 |
| [SPEC-710](../specs/p7-engagement/SPEC-710-parametres-automatismes.md) | Paramètres : Automatismes | P7 | ⏳ waiting | 0 | — | SPEC-707, SPEC-711 |
| [SPEC-711](../specs/p7-engagement/SPEC-711-moteur-d-automatismes.md) | Moteur d'automatismes | P7 | ⏳ waiting | 0 | — | SPEC-203, SPEC-209, SPEC-108, SPEC-411 |
| [SPEC-712](../specs/p7-engagement/SPEC-712-automatisme-1-reprise-apres-decrochage.md) | Automatisme 1 : reprise après décrochage | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-407 |
| [SPEC-713](../specs/p7-engagement/SPEC-713-automatisme-2-micro-seance-de-secours.md) | Automatisme 2 : micro-séance de secours | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-703 |
| [SPEC-714](../specs/p7-engagement/SPEC-714-automatisme-3-echauffement.md) | Automatisme 3 : échauffement | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-410 |
| [SPEC-715](../specs/p7-engagement/SPEC-715-automatisme-4-remediation-apres-un-quiz-rate.md) | Automatisme 4 : remédiation après un quiz raté | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-612 |
| [SPEC-716](../specs/p7-engagement/SPEC-716-automatisme-5-jeu-choisi-selon-la-lacune.md) | Automatisme 5 : jeu choisi selon la lacune | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-406 |
| [SPEC-717](../specs/p7-engagement/SPEC-717-automatisme-6-questions-transformees-en-cartes.md) | Automatisme 6 : questions transformées en cartes | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-610 |
| [SPEC-718](../specs/p7-engagement/SPEC-718-automatisme-7-quiz-global-plafonne-et-lisse.md) | Automatisme 7 : quiz global plafonné et lissé | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-406 |
| [SPEC-719](../specs/p7-engagement/SPEC-719-automatisme-8-sprint-avant-un-jalon.md) | Automatisme 8 : sprint avant un jalon | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-407 |
| [SPEC-720](../specs/p7-engagement/SPEC-720-automatisme-9-bilan-de-la-semaine.md) | Automatisme 9 : bilan de la semaine | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-408 |
| [SPEC-721](../specs/p7-engagement/SPEC-721-automatisme-10-mode-pause-et-retour.md) | Automatisme 10 : mode pause et retour | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-407, SPEC-409 |
| [SPEC-722](../specs/p7-engagement/SPEC-722-accueil-le-tuteur-a-agi-pour-vous.md) | Accueil : le tuteur a agi pour vous | P7 | ⏳ waiting | 0 | — | SPEC-711, SPEC-603 |
| [SPEC-723](../specs/p7-engagement/SPEC-723-serie-regularite-et-jalons-interface.md) | Série, régularité et jalons : interface | P7 | ⏳ waiting | 0 | — | SPEC-409, SPEC-304 |
| [SPEC-724](../specs/p7-engagement/SPEC-724-formations-a-plusieurs.md) | Formations à plusieurs | P7 | ⏳ waiting | 0 | — | SPEC-111, SPEC-606, SPEC-602 |
| [SPEC-725](../specs/p7-engagement/SPEC-725-abonnement-a-l-ia-fournie-interface-et-plafond.md) | Abonnement à l'IA fournie : interface et plafond | P7 | ⏳ waiting | 0 | — | SPEC-210, SPEC-507, SPEC-709 |
| [SPEC-801](../specs/p8-livraison-v1/SPEC-801-application-installable-et-revisions-hors-ligne.md) | Application installable et révisions hors ligne | P8 | ⏳ waiting | 0 | — | SPEC-701, SPEC-702 |
| [SPEC-802](../specs/p8-livraison-v1/SPEC-802-responsive-et-mobile.md) | Responsive et mobile | P8 | ⏳ waiting | 0 | — | SPEC-618, SPEC-725, SPEC-724, SPEC-616 |
| [SPEC-803](../specs/p8-livraison-v1/SPEC-803-accessibilite-wcag-2-2-aa.md) | Accessibilité WCAG 2.2 AA | P8 | ⏳ waiting | 0 | — | SPEC-802 |
| [SPEC-804](../specs/p8-livraison-v1/SPEC-804-performances.md) | Performances | P8 | ⏳ waiting | 0 | — | SPEC-802 |
| [SPEC-805](../specs/p8-livraison-v1/SPEC-805-securite.md) | Sécurité | P8 | ⏳ waiting | 0 | — | SPEC-802 |
| [SPEC-806](../specs/p8-livraison-v1/SPEC-806-rgpd-et-pages-legales.md) | RGPD et pages légales | P8 | ⏳ waiting | 0 | — | SPEC-802, SPEC-211 |
| [SPEC-807](../specs/p8-livraison-v1/SPEC-807-parcours-de-bout-en-bout-et-non-regression-globale.md) | Parcours de bout en bout et non-régression globale | P8 | ⏳ waiting | 0 | — | SPEC-803, SPEC-804, SPEC-805, SPEC-806, SPEC-801 |
| [SPEC-808](../specs/p8-livraison-v1/SPEC-808-mise-en-production-et-version-1-0-0.md) | Mise en production et version 1.0.0 | P8 | ⏳ waiting | 0 | — | SPEC-807, SPEC-013 |
| [SPEC-901](../specs/p9-v2/SPEC-901-import-audio-avec-transcription.md) | Import audio avec transcription | P9 | ⏳ waiting | 0 | — | SPEC-509 |
| [SPEC-902](../specs/p9-v2/SPEC-902-import-video-avec-transcription.md) | Import vidéo avec transcription | P9 | ⏳ waiting | 0 | — | SPEC-901 |
| [SPEC-903](../specs/p9-v2/SPEC-903-detection-des-liens-entre-ressources-et-entre-modu.md) | Détection des liens entre ressources et entre modules | P9 | ⏳ waiting | 0 | — | SPEC-616, SPEC-511 |
| [SPEC-904](../specs/p9-v2/SPEC-904-explique-a-un-debutant.md) | Explique à un débutant | P9 | ⏳ waiting | 0 | — | SPEC-905 |
| [SPEC-905](../specs/p9-v2/SPEC-905-mises-en-situation.md) | Mises en situation | P9 | ⏳ waiting | 0 | — | SPEC-508, SPEC-503 |
| [SPEC-906](../specs/p9-v2/SPEC-906-projet-fil-rouge.md) | Projet fil rouge | P9 | ⏳ waiting | 0 | — | SPEC-613, SPEC-407 |
| [SPEC-907](../specs/p9-v2/SPEC-907-detection-fine-de-la-baisse-d-engagement.md) | Détection fine de la baisse d'engagement | P9 | ⏳ waiting | 0 | — | SPEC-711 |
| [SPEC-908](../specs/p9-v2/SPEC-908-version-2-0-0.md) | Version 2.0.0 | P9 | ⏳ waiting | 0 | — | SPEC-901, SPEC-902, SPEC-903, SPEC-904, SPEC-905, SPEC-906, SPEC-907 |

## Anomalies et blocages

Aucun.

Détails : [anomalies.md](anomalies.md), [blockers.md](blockers.md).
