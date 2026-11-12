# Changelog

Toutes les évolutions notables de Learny sont consignées ici. Format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/). Les sections de version sont générées depuis les commits par `node tools/sdd/changelog.mjs` à chaque checkpoint (tags `cp-n`, `v0.<n>.0`, `v1.0.0` à CP-8, `v2.0.0` à CP-9).

## [Non publié]

### Ajouté

- Référentiel Spec-Driven Development : vision, 177 règles métier, écrans, glossaire, architecture (vue d'ensemble, modèle de données, API, IA), conventions d'ingénierie, registre des ADR, catalogue de 132 spécifications en 10 phases, checkpoints CP-0 à CP-9, outillage `tools/sdd/` (boucle autonome, validation, preuves, suivi, audit), workflow CI initial.
- Maquettes cliquables des 14 écrans (`design/maquettes/`) et spécification historique (`docs/legacy/specification-v0/`).

## [v0.1.0] — 2026-11-12

### Ajouts

- feat(SPEC-115): charge le jeu de démonstration
- feat(SPEC-114): expose la démonstration et les preuves visuelles
- feat(SPEC-114): signe les accès aux fichiers
- feat(SPEC-114): crée les buckets privés
- feat(SPEC-113): expose la démonstration et les preuves visuelles
- feat(SPEC-113): impose les politiques RLS
- feat(SPEC-111): ajoute la page de démonstration et son parcours e2e
- feat(SPEC-111): expose la progression limitée du groupe
- feat(SPEC-111): crée groupes et membres
- feat(SPEC-110): ajoute la démonstration des coûts IA
- feat(SPEC-112): démontre recherche et données personnelles
- feat(SPEC-110): crée les tables et l’agrégat IA/facturation
- feat(SPEC-112): recherche le contenu privé
- feat(SPEC-112): crée export acceptations et quotas
- feat(SPEC-109): ajoute la page de démonstration et son parcours e2e
- feat(SPEC-109): migre et protège les notifications
- feat(SPEC-109): crée la boîte et les livraisons
- feat(SPEC-108): ajoute la page de démonstration et son parcours e2e
- feat(SPEC-108): expose les repositories agenda et automatismes
- feat(SPEC-108): migre et protège les données de planning
- feat(SPEC-108): crée agenda actions et série
- feat(SPEC-107): ajoute la page de démonstration et son parcours e2e
- feat(SPEC-107): migre et indexe les révisions
- feat(SPEC-107): crée les états de mémorisation et lacunes
- feat(SPEC-106): ajoute la page de démonstration et son parcours e2e
- feat(SPEC-106): valide et persiste les activités et tentatives
- feat(SPEC-106): crée le schéma des briques et activités
- feat(SPEC-105): ajoute la page de démonstration
- feat(SPEC-105): ajoute le schéma des cours et discussions
- feat(SPEC-104): ajoute la page de démonstration
- feat(SPEC-104): ajoute ressources et passages vectoriels
- feat(SPEC-103): ajoute la page de démonstration
- feat(SPEC-103): ajoute contraintes de liens et index plein texte
- feat(SPEC-103): ajoute le schéma des formations et du programme
- feat(SPEC-102): ajoute la page de démonstration
- feat(SPEC-102): ajoute le schéma identité et préférences
- feat(SPEC-101): ajoute la page de démonstration
- feat(SPEC-101): ajoute la synchronisation des migrations
- feat(SPEC-101): ajoute les clients userDb et serviceDb et le harnais de test
- feat(SPEC-101): ajoute extensions, fonctions partagées et énumérations

### Corrections

- fix(SPEC-103): isole la démo FTS du seed de démonstration
- fix(SPEC-012): démarre le stockage avant les migrations
- fix(SPEC-111): adapte les comptes de test à GoTrue v2.197
- fix(SPEC-105): ordonne les messages de la démonstration

### Documentation

- docs(SPEC-114): consigne les décisions de stockage
- docs(SPEC-115): inventorie les données des maquettes
- docs(SPEC-111): consigne les décisions du schéma à plusieurs
- docs(SPEC-110): consigne les décisions de schéma IA et facturation
- docs(SPEC-112): consigne les décisions d'implémentation
- docs(SPEC-109): consigne les décisions de persistance et de RLS
- docs(SPEC-108): consigne les décisions de persistance et de RLS
- docs(SPEC-107): consigne les décisions de persistance et de RLS
- docs(SPEC-106): consigne les décisions de schéma et de concurrence
- docs(SPEC-105): consigne les compléments d'implémentation
- docs(SPEC-104): consigne les compléments d'implémentation
- docs(SPEC-103): consigne les compléments d'implémentation
- docs(SPEC-102): consigne les compléments d'implémentation
- docs(SPEC-101): documente le paquet db et consigne les décisions

### Tests

- test(SPEC-101): actualise les lignes de base après les démos P1
- test(SPEC-103): isole la recherche FTS sur sa formation
- test(SPEC-008): restaure la pile après le test d'arrêt
- test(SPEC-115): ajoute les fabriques et vérifie l'idempotence
- test(SPEC-113): limite l'inventaire aux politiques publiques
- test(SPEC-114): prouve l'isolation Storage
- test(SPEC-113): prouve l'isolation de chaque table
- test(SPEC-113): inventorie les tables et accès attendus
- test(SPEC-111): vérifie capacité et confidentialité
- test(SPEC-110): ajoute les lignes de base visuelles
- test(SPEC-110): vérifie coût, secret et RLS en base
- test(SPEC-112): vérifie recherche et idempotence
- test(SPEC-109): vérifie déduplication et préférences
- test(SPEC-108): vérifie statuts et traçabilité
- test(SPEC-107): met à jour la ligne de base de SPEC-101
- test(SPEC-107): rend l'ordre des événements de lacune déterministe
- test(SPEC-107): vérifie FSRS persistant, concurrence et isolation
- test(SPEC-106): met à jour la ligne de base de SPEC-101
- test(SPEC-106): couvre la persistance et l'isolation RLS
- test(SPEC-105): couvre versions, citations et discussions
- test(SPEC-104): couvre limites, cascades et recherche vectorielle
- test(SPEC-103): actualise les lignes de base après le registre et les migrations
- test(SPEC-103): couvre contraintes et cascades du programme
- test(SPEC-006): actualise la ligne de base du registre
- test(SPEC-003): suit le registre réel des démonstrations
- test(SPEC-102): ajoute le test e2e et visuel
- test(SPEC-102): couvre défauts, contraintes et déclencheurs
- test(SPEC-101): met à jour la ligne de base visuelle SPEC-006
- test(SPEC-101): nomme la capture de preuve de la page db
- test(SPEC-101): ajoute le harnais et les tests de la base

### Construction

- build(SPEC-101): crée le paquet db et la configuration drizzle-kit

## [v0.0.0] — 2026-11-11

### Ajouts

- feat(SPEC-010): propage les identifiants de requête
- feat(SPEC-010): remonte les erreurs et enrichit la santé
- feat(SPEC-010): structure et expurge les journaux
- feat(SPEC-013): prépare les déploiements contrôlés
- feat(SPEC-012): expose l'état de la pile auto-hébergée
- feat(SPEC-009): expose la configuration sur la page SDD
- feat(SPEC-009): centralise les constantes produit et IA
- feat(SPEC-009): isole la configuration serveur
- feat(SPEC-009): valide les variables d'environnement
- feat(SPEC-005): capture déterministe des maquettes
- feat(SPEC-007): sert les jobs dans web et worker
- feat(SPEC-006): masque les piles d'erreur dans la console du navigateur
- feat(SPEC-007): ajoute un job durable de démonstration
- feat(SPEC-006): ajoute le client API et les pages système
- feat(SPEC-004): collecte les preuves réelles
- feat(SPEC-004): ajoute les comparaisons visuelles et l'accessibilité
- feat(SPEC-006): protège les pages de démonstration
- feat(SPEC-006): enrichit la route de santé
- feat(SPEC-003): affiche l'état du référentiel
- feat(SPEC-002): ajoute la démonstration des conventions de commit
- feat(SPEC-002): détecte les secrets avant commit
- feat(SPEC-002): définit les règles de commit
- feat(SPEC-001): ajoute la page de démonstration SDD
- feat(SPEC-001): crée l'application web minimale et la route de santé
- feat(SPEC-001): ajoute les paquets core et config

### Corrections

- fix(SPEC-012): aligne l'auto-hébergement sur la production
- fix(SPEC-008): aligne l'environnement de la pile sur SPEC-009
- fix(SPEC-012): autorise les références SDD dans le garde des pages
- fix(SPEC-005): sert les références à travers le garde SDD
- fix(SPEC-009): restaure les valeurs par défaut des variables vides
- fix(SPEC-003): aligne l'e2e de l'index sur l'état réel
- fix(SPEC-003): stabilise la mise en page de l'index SDD
- fix(SPEC-002): compte une seule trouvaille par secret

### Refactorisations

- refactor(SPEC-003): rend la boucle SDD testable

### Documentation

- docs(SPEC-010): référence l'ADR-0230 dans l'index
- docs(SPEC-010): consigne l'entrée serveur et la forme des composants de santé
- docs(SPEC-013): documente les environnements gérés
- docs(SPEC-012): documente l'auto-hébergement
- docs(SPEC-009): renumérote les ADR après fusion
- docs(SPEC-011): consigne l'ADR-0226 et l'emplacement des tests
- docs(SPEC-009): consigne les décisions d'implémentation
- docs(SPEC-005): consigne l'ADR-0225
- docs(SPEC-005): enregistre les références visuelles
- docs(SPEC-004): consigne l'ADR-0224
- docs(SPEC-003): consigne l'ADR-0223
- docs(SPEC-002): consigne l'ADR-0222
- docs(SPEC-002): documente les conventions de contribution
- docs(SPEC-001): consigne les ADR-0220 et ADR-0221

### Tests

- test(SPEC-010): couvre la projection Sentry
- test(SPEC-003): suit le registre réel des démonstrations
- test(SPEC-010): actualise la ligne de base SPEC-006 après l'entrée du registre
- test(SPEC-010): vérifie corrélation et non-fuite
- test(SPEC-006): actualise la ligne de base après SPEC-013
- test(SPEC-013): vérifie régions et pipeline
- test(SPEC-012): vérifie images et persistance
- test(SPEC-006): actualise les lignes de base après fusion
- test(SPEC-009): actualise la ligne de base de SPEC-006
- test(SPEC-011): actualise la ligne de base après ajout de la page
- test(SPEC-009): précise la cohérence de l'exemple et la frontière
- test(SPEC-011): conserve les captures desktop et mobile
- test(SPEC-009): vérifie modes, secrets et exemple
- test(SPEC-011): vérifie la matrice CI et ses garde-fous
- test(SPEC-008): vérifie la pile Docker et sa démonstration
- test(SPEC-007): met à jour la ligne de base après fusion
- test(SPEC-006): met à jour la ligne de base après fusion
- test(SPEC-005): vérifie les références et leur reproductibilité
- test(SPEC-006): vérifie santé erreurs et garde SDD
- test(SPEC-007): vérifie les deux hôtes et la reprise
- test(SPEC-004): vérifie le harnais complet
- test(SPEC-004): fixe le temps et les services simulés
- test(SPEC-003): vérifie la sélection la reprise et l'audit
- test(SPEC-002): teste les règles de commit et la détection des secrets
- test(SPEC-001): ajoute les tests unitaires, d'intégration et e2e

### Construction

- build(SPEC-013): fixe les régions gérées
- build(SPEC-012): assemble la pile auto-hébergée
- build(SPEC-012): construit les images web et worker
- build(SPEC-008): configure Supabase Inngest et Mailpit locaux
- build(SPEC-007): crée le paquet jobs
- build(SPEC-004): installe le paquet de tests
- build(SPEC-003): expose les commandes SDD dans pnpm
- build(SPEC-002): ajoute les hooks Git
- build(SPEC-002): installe Husky, lint-staged et commitlint
- build(SPEC-001): configure Vitest et Playwright
- build(SPEC-001): configure ESLint, Prettier et les frontières de paquets
- build(SPEC-001): initialise le monorepo pnpm et Turborepo

### Intégration continue

- ci(SPEC-013): déploie les environnements gérés
- ci(SPEC-011): valide les workflows et titres de PR
- ci(SPEC-011): complète les jobs de qualité et de preuve

