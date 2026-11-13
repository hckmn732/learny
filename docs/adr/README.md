# Registre des décisions (ADR)

Toute décision structurante est consignée ici. **Les ADR priment** sur les autres documents en cas de conflit. Une décision prise pendant l'implémentation (ambiguïté résolue sans solliciter l'utilisateur) crée un nouvel ADR avec l'origine « Déduite » via `node tools/sdd/adr.mjs new "<titre>"`, puis est référencée dans la spécification concernée.

Origine : **Validée** = décision prise avec le porteur du projet ; **Déduite** = décision prise par la préparation du référentiel.

| ADR | Titre | Origine | Liens |
|---|---|---|---|
| [ADR-0001](ADR-0001-developpement-pilote-par-les-specifications-sdd.md) | Développement piloté par les spécifications (SDD) | Déduite | AGENTS.md, SPEC-003 |
| [ADR-0002](ADR-0002-monorepo-pnpm-et-turborepo.md) | Monorepo pnpm et Turborepo | Validée | SPEC-001 |
| [ADR-0003](ADR-0003-versions-du-socle-technique.md) | Versions du socle technique | Déduite | SPEC-001 |
| [ADR-0004](ADR-0004-application-web-next-js-api-integree.md) | Application web Next.js, API intégrée | Validée | SPEC-001, SPEC-006, SPEC-201 |
| [ADR-0005](ADR-0005-perimetre-produit.md) | Périmètre produit | Validée | docs/product/vision.md |
| [ADR-0006](ADR-0006-supabase-cloud-en-region-ue.md) | Supabase Cloud en région UE | Validée | SPEC-008, SPEC-101 |
| [ADR-0007](ADR-0007-authentification-par-lien-magique-ou-mot-de-passe.md) | Authentification par lien magique ou mot de passe | Validée | SPEC-202, SPEC-601 |
| [ADR-0008](ADR-0008-types-d-apports-par-version.md) | Types d'apports par version | Validée | SPEC-607, SPEC-901 |
| [ADR-0009](ADR-0009-langues.md) | Langues | Validée | SPEC-602, SPEC-707 |
| [ADR-0010](ADR-0010-ton-du-tuteur.md) | Ton du tuteur | Validée | SPEC-508, SPEC-209 |
| [ADR-0011](ADR-0011-modele-economique-gratuit-avec-sa-cle-ia-fournie-payante.md) | Modèle économique : gratuit avec sa clé, IA fournie payante | Validée | SPEC-210, SPEC-725 |
| [ADR-0012](ADR-0012-plafond-quotidien-de-l-ia-fournie.md) | Plafond quotidien de l'IA fournie | Validée | SPEC-507 |
| [ADR-0013](ADR-0013-modele-personnel-defaillant.md) | Modèle personnel défaillant | Validée | SPEC-508, SPEC-506 |
| [ADR-0014](ADR-0014-seuils-et-taille-des-quiz.md) | Seuils et taille des quiz | Validée | SPEC-611 |
| [ADR-0015](ADR-0015-fin-de-formation-et-entretien-de-memoire.md) | Fin de formation et entretien de mémoire | Validée | SPEC-617 |
| [ADR-0016](ADR-0016-pause-d-une-formation-et-limite-de-trois.md) | Pause d'une formation et limite de trois | Validée | SPEC-618, SPEC-721 |
| [ADR-0017](ADR-0017-jobs-durables-avec-inngest.md) | Jobs durables avec Inngest | Validée | SPEC-007, SPEC-203 |
| [ADR-0018](ADR-0018-modeles-claude-par-tache.md) | Modèles Claude par tâche | Validée | SPEC-504 |
| [ADR-0019](ADR-0019-couche-multi-fournisseurs-et-fonctions-anthropic.md) | Couche multi-fournisseurs et fonctions Anthropic | Validée | SPEC-504, SPEC-507 |
| [ADR-0020](ADR-0020-moteur-d-apprentissage-deterministe.md) | Moteur d'apprentissage déterministe | Validée | SPEC-401 à SPEC-411 |
| [ADR-0021](ADR-0021-le-modele-propose-le-code-valide.md) | Le modèle propose, le code valide | Validée | SPEC-508 |
| [ADR-0022](ADR-0022-conventions-de-base-de-donnees-et-rls.md) | Conventions de base de données et RLS | Validée | SPEC-113 |
| [ADR-0023](ADR-0023-defense-contre-l-injection-de-consignes.md) | Défense contre l'injection de consignes | Validée | SPEC-508, SPEC-805 |
| [ADR-0024](ADR-0024-maitrise-et-lacunes.md) | Maîtrise et lacunes | Déduite | SPEC-403, SPEC-404 |
| [ADR-0025](ADR-0025-fsrs-par-notion.md) | FSRS par notion | Validée | SPEC-402 |
| [ADR-0026](ADR-0026-banques-de-questions-propres-a-chaque-apprenant.md) | Banques de questions propres à chaque apprenant | Déduite | SPEC-513 |
| [ADR-0027](ADR-0027-exercice-pratique-production-structuree.md) | Exercice pratique : production structurée | Déduite | SPEC-501, SPEC-613 |
| [ADR-0028](ADR-0028-examens-blancs.md) | Examens blancs | Validée | SPEC-614 |
| [ADR-0029](ADR-0029-planificateur-glouton.md) | Planificateur glouton | Validée | SPEC-407 |
| [ADR-0030](ADR-0030-fuseaux-horaires.md) | Fuseaux horaires | Déduite | SPEC-207 |
| [ADR-0031](ADR-0031-plafond-de-notifications.md) | Plafond de notifications | Validée | SPEC-209 |
| [ADR-0032](ADR-0032-e-mails-transactionnels-et-preferences.md) | E-mails transactionnels et préférences | Déduite | SPEC-204 |
| [ADR-0033](ADR-0033-comptage-de-la-serie.md) | Comptage de la série | Déduite | SPEC-409 |
| [ADR-0034](ADR-0034-echelle-d-affichage-et-conformite-visuelle.md) | Échelle d'affichage et conformité visuelle | Déduite | SPEC-005, SPEC-301 |
| [ADR-0035](ADR-0035-formations-a-plusieurs-modele-de-partage.md) | Formations à plusieurs : modèle de partage | Validée | SPEC-111, SPEC-724 |
| [ADR-0036](ADR-0036-carte-des-notions-rendu-svg-et-disposition-deterministe.md) | Carte des notions : rendu SVG et disposition déterministe | Déduite | SPEC-616 |
| [ADR-0037](ADR-0037-pwa-et-hors-ligne.md) | PWA et hors ligne | Validée | SPEC-801 |
| [ADR-0038](ADR-0038-accessibilite.md) | Accessibilité | Déduite | SPEC-309, SPEC-803 |
| [ADR-0039](ADR-0039-limites-d-import-et-suppression-d-apports.md) | Limites d'import et suppression d'apports | Déduite | SPEC-206, SPEC-607 |
| [ADR-0040](ADR-0040-historique-des-discussions-avec-le-tuteur.md) | Historique des discussions avec le tuteur | Déduite | SPEC-610 |
| [ADR-0041](ADR-0041-budgets-de-performance.md) | Budgets de performance | Déduite | SPEC-804 |
| [ADR-0042](ADR-0042-securite-applicative.md) | Sécurité applicative | Déduite | SPEC-208, SPEC-805 |
| [ADR-0043](ADR-0043-observabilite.md) | Observabilité | Déduite | SPEC-010 |
| [ADR-0044](ADR-0044-export-et-suppression-des-donnees.md) | Export et suppression des données | Validée | SPEC-211 |
| [ADR-0045](ADR-0045-rgpd-pages-legales-et-entite-juridique.md) | RGPD, pages légales et entité juridique | Déduite | SPEC-806 |
| [ADR-0046](ADR-0046-routes-en-francais.md) | Routes en français | Déduite | docs/product/screens.md |
| [ADR-0047](ADR-0047-horloge-injectable-et-date-de-reference-des-tests.md) | Horloge injectable et date de référence des tests | Déduite | SPEC-004, SPEC-207 |
| [ADR-0048](ADR-0048-tests-de-l-ia-et-recherche-web-de-repli.md) | Tests de l'IA et recherche web de repli | Déduite | SPEC-504, SPEC-512 |
| [ADR-0049](ADR-0049-pages-de-demonstration-sdd.md) | Pages de démonstration SDD | Déduite | SPEC-006 |
| [ADR-0050](ADR-0050-stockage-des-videos-de-preuves.md) | Stockage des vidéos de preuves | Déduite | SPEC-003, SPEC-004 |
| [ADR-0051](ADR-0051-versionnement-git.md) | Versionnement Git | Validée | SPEC-002 |
| [ADR-0052](ADR-0052-integration-continue-github-actions.md) | Intégration continue GitHub Actions | Déduite | SPEC-011 |
| [ADR-0053](ADR-0053-docker-developpement-et-auto-hebergement.md) | Docker : développement et auto-hébergement | Validée | SPEC-008, SPEC-012 |
| [ADR-0054](ADR-0054-e-mails-avec-resend-et-react-email.md) | E-mails avec Resend et React Email | Validée | SPEC-204 |
| [ADR-0055](ADR-0055-notifications-navigateur.md) | Notifications navigateur | Validée | SPEC-205 |
| [ADR-0056](ADR-0056-embeddings-et-index-vectoriel.md) | Embeddings et index vectoriel | Validée | SPEC-509, SPEC-511 |
| [ADR-0057](ADR-0057-extraction-des-apports.md) | Extraction des apports | Déduite | SPEC-509, SPEC-510 |
| [ADR-0058](ADR-0058-stockage-des-fichiers.md) | Stockage des fichiers | Déduite | SPEC-114, SPEC-206 |
| [ADR-0059](ADR-0059-design-system.md) | Design system | Déduite | SPEC-301 à SPEC-303 |
| [ADR-0060](ADR-0060-rendu-markdown-securise.md) | Rendu Markdown sécurisé | Déduite | SPEC-609 |
| [ADR-0061](ADR-0061-paiement-stripe.md) | Paiement Stripe | Validée | SPEC-210 |
| [ADR-0062](ADR-0062-recherche-plein-texte.md) | Recherche plein texte | Déduite | SPEC-112, SPEC-212 |
| [ADR-0063](ADR-0063-donnees-cote-client.md) | Données côté client | Déduite | SPEC-201 |
| [ADR-0064](ADR-0064-formulaires.md) | Formulaires | Déduite | SPEC-302 |
| [ADR-0065](ADR-0065-suivi-des-traitements-asynchrones-dans-l-interface.md) | Suivi des traitements asynchrones dans l'interface | Déduite | SPEC-607, SPEC-608 |
| [ADR-0066](ADR-0066-flux-de-la-discussion-avec-le-tuteur.md) | Flux de la discussion avec le tuteur | Déduite | SPEC-610 |
| [ADR-0067](ADR-0067-crons-par-fuseau.md) | Crons par fuseau | Déduite | SPEC-203 |
| [ADR-0068](ADR-0068-source-de-verite-du-suivi.md) | Source de vérité du suivi | Déduite | SPEC-003 |
| [ADR-0069](ADR-0069-checkpoints-et-reprise-automatique.md) | Checkpoints et reprise automatique | Déduite | SPEC-003 |
| [ADR-0070](ADR-0070-outils-de-test.md) | Outils de test | Déduite | SPEC-004 |
| [ADR-0071](ADR-0071-jeu-de-donnees-de-demonstration.md) | Jeu de données de démonstration | Déduite | SPEC-115 |
| [ADR-0072](ADR-0072-consignes-en-anglais.md) | Consignes en anglais | Déduite | SPEC-508 |
| [ADR-0073](ADR-0073-tarifs-de-l-ia-en-configuration.md) | Tarifs de l'IA en configuration | Déduite | SPEC-507 |
| [ADR-0074](ADR-0074-fonctions-v2-desactivees.md) | Fonctions V2 désactivées | Déduite | SPEC-901 à SPEC-908 |
| [ADR-0075](ADR-0075-changer-de-formation-et-formation-courante.md) | Changer de formation et formation courante | Déduite | SPEC-304, SPEC-618 |
| [ADR-0203](ADR-0203-propriete-de-l-index-sdd-entre-spec-003-et-spec-006.md) | Propriete de l'index SDD entre SPEC-003 et SPEC-006 | Déduite | SPEC-003, SPEC-006 |
| [ADR-0204](ADR-0204-page-publique-d-accessibilite-et-liens-de-pied-de-page.md) | Page publique d'accessibilite et liens de pied de page | Déduite | SPEC-803, SPEC-806 |
| [ADR-0205](ADR-0205-limites-et-horodatage-des-imports-audio-et-video-v2.md) | Limites et horodatage des imports audio et video V2 | Déduite | SPEC-901, SPEC-902 |
| [ADR-0206](ADR-0206-empreinte-de-requete-pour-les-cles-d-idempotence.md) | Empreinte de requete pour les cles d'idempotence (remplacée par ADR-0219) | Déduite | SPEC-112, SPEC-201, SPEC-208 |
| [ADR-0207](ADR-0207-liens-v2-entre-ressources-et-notions-de-modules-differents.md) | Liens V2 entre ressources et notions de modules differents | Déduite | SPEC-903 |
| [ADR-0208](ADR-0208-contrat-des-dialogues-pedagogiques-v2.md) | Contrat des dialogues pedagogiques V2 | Déduite | SPEC-904, SPEC-905 |
| [ADR-0209](ADR-0209-plafond-de-vingt-notions-par-module-pour-le-quiz.md) | Plafond de vingt notions par module pour le quiz | Déduite | SPEC-405, SPEC-605 |
| [ADR-0210](ADR-0210-selection-d-une-revision-pour-la-retention-a-un-et-deux-mois.md) | Selection d'une revision pour la retention a un et deux mois | Déduite | SPEC-408 |
| [ADR-0211](ADR-0211-etapes-et-evaluation-du-projet-fil-rouge-v2.md) | Etapes et evaluation du projet fil rouge V2 | Déduite | SPEC-906 |
| [ADR-0212](ADR-0212-signaux-et-garde-fous-de-baisse-d-engagement-v2.md) | Signaux et garde-fous de baisse d'engagement V2 | Déduite | SPEC-907 |
| [ADR-0213](ADR-0213-seau-a-jetons-profils-de-debit-et-verification-d-origine.md) | Seau a jetons, profils de debit et verification d'origine | Déduite | SPEC-208 |
| [ADR-0214](ADR-0214-routage-unifie-des-notifications-et-report-des-envois.md) | Routage unifie des notifications et report des envois | Déduite | SPEC-209 |
| [ADR-0215](ADR-0215-statuts-stripe-et-droit-a-l-ia-fournie.md) | Statuts Stripe et droit a l'IA fournie | Déduite | SPEC-210 |
| [ADR-0216](ADR-0216-contenu-de-l-export-et-execution-de-la-suppression-du-compte.md) | Contenu de l'export et execution de la suppression du compte | Déduite | SPEC-211 |
| [ADR-0217](ADR-0217-regroupement-et-extraits-de-la-recherche-globale.md) | Regroupement et extraits de la recherche globale | Déduite | SPEC-212 |
| [ADR-0218](ADR-0218-calendrier-et-exclusions-de-la-detection-de-baisse-d-engagem.md) | Calendrier et exclusions de la detection de baisse d'engagement V2 | Déduite | SPEC-907 |
| [ADR-0219](ADR-0219-resolution-du-conflit-entre-adr-0120-et-adr-0206-sur-l-idemp.md) | Resolution du conflit entre ADR-0120 et ADR-0206 sur l'idempotence | Déduite | SPEC-112, SPEC-201, SPEC-208 |
| [ADR-0220](ADR-0220-outillage-spec-001-lint-de-tools-sdd-prettier-et-fichiers-an.md) | Outillage SPEC-001 : lint de tools/sdd, Prettier et fichiers annexes | Déduite | SPEC-001 |
| [ADR-0221](ADR-0221-versions-retenues-a-l-installation-de-spec-001.md) | Versions retenues à l'installation de SPEC-001 | Déduite | SPEC-001, ADR-0003 |
| [ADR-0222](ADR-0222-ajustements-d-implementation-de-spec-002.md) | Ajustements d'implémentation de SPEC-002 | Déduite | SPEC-002, ADR-0103 |
| [ADR-0223](ADR-0223-outillage-sdd-testable-et-index-de-progression-spec-003.md) | Outillage SDD testable et index de progression (SPEC-003) | Déduite | SPEC-003, ADR-0068, ADR-0203 |
| [ADR-0224](ADR-0224-socle-de-tests-spec-004-projets-gardes-et-collecte.md) | Socle de tests SPEC-004 : projets, gardes et collecte | Déduite | SPEC-004, ADR-0047, ADR-0048, ADR-0050, ADR-0101 |
| [ADR-0225](ADR-0225-captures-de-reference-deterministes.md) | Captures de référence déterministes | Déduite | SPEC-005 |
| [ADR-0226](ADR-0226-emplacement-des-tests-du-validateur-ci-et-conservation-des-a.md) | Emplacement des tests du validateur CI et conservation des artefacts | Déduite | SPEC-011 |
| [ADR-0227](ADR-0227-politique-de-validation-de-l-environnement-et-du-fichier-d-e.md) | Politique de validation de l'environnement et du fichier d'exemple | Déduite | SPEC-009 |
| [ADR-0228](ADR-0228-frontiere-client-serveur-de-la-configuration-et-validation-a.md) | Frontière client/serveur de la configuration et validation au démarrage | Déduite | SPEC-009, SPEC-006 |
| [ADR-0229](ADR-0229-tarifs-de-l-ia-ecriture-de-cache-et-effort-de-reflexion.md) | Tarifs de l'IA : écriture de cache et effort de réflexion | Déduite | SPEC-009, SPEC-507, ADR-0073 |
| [ADR-0230](ADR-0230-environnements-geres-declenchement-secrets-prefixes-et-dry-r.md) | Environnements gérés : déclenchement, secrets préfixés et dry-run | Déduite | SPEC-013, BR-PLA-04, ADR-0006, ADR-0017, ADR-0052 |
| [ADR-0231](ADR-0231-composants-versions-et-exposition-reseau-de-la-pile-auto-heb.md) | Composants, versions et exposition réseau de la pile auto-hébergée | Déduite | SPEC-012, ADR-0053 |
| [ADR-0232](ADR-0232-migrations-sondes-et-preuves-executables-de-l-auto-hebergeme.md) | Migrations, sondes et preuves exécutables de l'auto-hébergement | Déduite | SPEC-012, ADR-0053, ADR-0047 |
| [ADR-0233](ADR-0233-entree-serveur-de-learny-core-et-composants-de-sante.md) | Entrée serveur de @learny/core et composants de santé | Déduite | SPEC-010 |
| [ADR-0234](ADR-0234-coexistence-de-la-migration-d-amorcage-0000-et-du-miroir-pre.md) | Coexistence de la migration d'amorçage 0000 et du miroir préfixé | Déduite | SPEC-101, ADR-0111 |
| [ADR-0235](ADR-0235-alias-createuserdb-et-harnais-sans-sequence.md) | Alias createUserDb et harnais sans séquence | Déduite | SPEC-101 |
| [ADR-0236](ADR-0236-complements-d-implementation-du-schema-identite.md) | Compléments d'implémentation du schéma identité | Déduite | SPEC-102 |
| [ADR-0237](ADR-0237-complements-d-implementation-du-schema-formations.md) | Compléments d'implémentation du schéma formations | Déduite | SPEC-103, SPEC-006, ADR-0049, ADR-0113 |
| [ADR-0238](ADR-0238-complements-d-implementation-du-schema-ressources-et-passage.md) | Compléments d'implémentation du schéma ressources et passages vectoriels | Déduite | SPEC-104, ADR-0056, ADR-0039, ADR-0112, ADR-0113 |
| [ADR-0239](ADR-0239-version-courante-a-l-insertion-et-coherence-proprietaire-pen.md) | Version courante à l'insertion et cohérence propriétaire pendant les cascades | Déduite | SPEC-105, ADR-0039, ADR-0112, ADR-0113 |
| [ADR-0240](ADR-0240-garde-d-assemblage-d-activite-et-rls-minimale-des-briques.md) | Garde d'assemblage d'activité et RLS minimale des briques | Déduite | SPEC-106, SPEC-113, ADR-0021, ADR-0112 |
| [ADR-0241](ADR-0241-numerotation-concurrente-des-tentatives-et-versions-de-briqu.md) | Numérotation concurrente des tentatives et versions de brique immuables | Déduite | SPEC-106, BR-BRI-06, ADR-0021 |
| [ADR-0242](ADR-0242-persistance-fsrs-concurrence-optimiste-et-lecture-seule-des-.md) | Persistance FSRS, concurrence optimiste et lecture seule des journaux | Déduite | SPEC-107, ADR-0022, ADR-0025, ADR-0112, ADR-0149 |
| [ADR-0243](ADR-0243-complements-d-implementation-du-schema-agenda-automatismes-e.md) | Compléments d'implémentation du schéma agenda, automatismes et série | Déduite | SPEC-108, ADR-0029, ADR-0033, ADR-0112, ADR-0113, ADR-0022 |
| [ADR-0244](ADR-0244-complements-d-implementation-du-schema-notifications.md) | Compléments d'implémentation du schéma notifications | Déduite | SPEC-109, ADR-0031, ADR-0112, ADR-0214, ADR-0047 |
| [ADR-0245](ADR-0245-schema-ia-et-facturation-secrets-chiffres-et-agregat-local.md) | Schéma IA et facturation : secrets chiffrés, RLS et agrégat local | Déduite | SPEC-110, ADR-0011, ADR-0012, ADR-0112, ADR-0215 |
| [ADR-0246](ADR-0246-schema-des-formations-a-plusieurs-complements.md) | Compléments d’implémentation du schéma des formations à plusieurs | Déduite | SPEC-111, SPEC-724, ADR-0035, ADR-0112, ADR-0113, ADR-0022 |
| [ADR-0247](ADR-0247-donnees-personnelles-idempotence-et-recherche.md) | Données personnelles, idempotence et recherche : isolation des sources et bornes | Déduite | SPEC-112, SPEC-113, SPEC-208, SPEC-211, SPEC-212, ADR-0044, ADR-0062, ADR-0120, ADR-0219 |
| [ADR-0248](ADR-0248-politiques-rls-de-spec-113-et-harnais-d-isolation.md) | Politiques RLS de SPEC-113 et harnais d'isolation | Déduite | SPEC-113 |
| [ADR-0249](ADR-0249-implementation-du-stockage-prive-et-des-url-signees-de-dix-m.md) | Implémentation du stockage privé et des URL signées de dix minutes | Déduite | SPEC-114, SPEC-113, SPEC-206 |
| [ADR-0250](ADR-0250-seed-de-demonstration-deterministe-et-fabriques-partagees.md) | Seed de démonstration déterministe et fabriques partagées | Déduite | SPEC-115 |
| [ADR-0251](ADR-0251-socle-api-v1-surcharge-de-handler-openapi-3-1-natif-et-acces.md) | Socle API v1 : surcharge de handler(), OpenAPI 3.1 natif et accès service de l'idempotence | Déduite | SPEC-201 |
| [ADR-0252](ADR-0252-authentification-proxy-next-16-redirection-relative-mail-loc.md) | Authentification : proxy Next 16, redirection relative, mail local et rappel du lien | Déduite | SPEC-202 |
| [ADR-0253](ADR-0253-validation-des-fuseaux-iana-et-repli-de-detection.md) | Validation des fuseaux IANA et repli de détection | Déduite | SPEC-207, SPEC-202, SPEC-602, ADR-0030 |
| [ADR-0254](ADR-0254-resolution-des-heures-locales-aux-changements-d-heure.md) | Résolution des heures locales aux changements d'heure | Déduite | SPEC-207, ADR-0030, ADR-0047 |
| [ADR-0255](ADR-0255-envois-prives-reservations-idempotence-sans-url-stockee-et-s.md) | Envois privés : réservations, idempotence sans URL stockée et suivi dans les métadonnées | Déduite | SPEC-206, SPEC-201, SPEC-104, SPEC-114, ADR-0039, ADR-0058, ADR-0120, ADR-0047 |
| [ADR-0256](ADR-0256-envois-prives-acces-storage-au-nom-de-l-utilisateur-et-lectu.md) | Envois privés : accès Storage au nom de l'utilisateur et lecture des octets réels | Déduite | SPEC-206, SPEC-114, SPEC-201, ADR-0058, ADR-0249, ADR-0057, ADR-0047 |
| [ADR-0257](ADR-0257-envois-prives-refus-definitifs-emission-unique-de-resource-u.md) | Envois privés : refus définitifs, émission unique de resource/uploaded et suppression qui conserve les citations | Déduite | SPEC-206, SPEC-104, SPEC-203, SPEC-607, ADR-0039, ADR-0122 |
| [ADR-0258](ADR-0258-protections-de-l-api-ordre-des-gardes-horloge-des-seaux-adre.md) | Protections de l'API : ordre des gardes, horloge des seaux, adresse du client | Déduite | SPEC-208 |
| [ADR-0259](ADR-0259-spec-203-evenements-types-avec-inngest-4-execution-en-ligne-.md) | SPEC-203 : événements typés avec Inngest 4, exécution en ligne et frontières de paquets | Déduite | SPEC-203, ADR-0017, ADR-0122, ADR-0123 |
| [ADR-0260](ADR-0260-enqueue-event-un-utilisateur-ne-met-en-file-que-ses-propres-.md) | enqueue_event : un utilisateur ne met en file que ses propres événements | Déduite | SPEC-203, ADR-0122, ADR-0035 |
| [ADR-0264](ADR-0264-liens-des-resultats-de-recherche-alignes-sur-les-routes-d-ec.md) | Liens des résultats de recherche alignés sur les routes d'écran | Déduite | SPEC-212, SPEC-112, SPEC-307, ADR-0046 |
| [ADR-0265](ADR-0265-canaux-donnees-et-reservation-du-plafond-du-service-de-notifications.md) | Canaux, données et réservation du plafond du service de notifications | Déduite | SPEC-209, ADR-0214, ADR-0031, ADR-0266 |
| [ADR-0266](ADR-0266-canal-push-paquet-notifications-partage-refus-neutre-d-un-en.md) | Canal push : paquet notifications partagé, refus neutre d'un endpoint étranger et mock déterministe | Déduite | SPEC-205, ADR-0055, ADR-0244 |
| [ADR-0261](ADR-0261-webhooks-stripe-emission-sur-changement-statuts-non-mappes-f.md) | Webhooks Stripe: emission sur changement, statuts non mappes, faux client partage | Déduite | SPEC-210, ADR-0215 |
| [ADR-0267](ADR-0267-suppression-du-compte-auth-avant-cascade-et-qualification-de.md) | Suppression du compte : Auth avant cascade et qualification des exports | Déduite | SPEC-211, ADR-0044, ADR-0216, ADR-0122, ADR-0047 |
| [ADR-0268](ADR-0268-jetons-de-design-nommage-echelle-de-1-px-theme-tailwind-ferm.md) | Jetons de design : nommage, échelle de 1 px, thème Tailwind fermé et galerie /_dev/ui | Déduite | SPEC-301, SPEC-005, SPEC-006, ADR-0034, ADR-0059 |
| [ADR-0269](ADR-0269-conventions-des-composants-et-galerie-dev-ui.md) | Conventions des composants et galerie /_dev/ui | Déduite | SPEC-302 |
| [ADR-0270](ADR-0270-composants-de-structure-et-de-retour-superpositions-toasts-e.md) | Composants de structure et de retour : superpositions, toasts et isolation modale | Déduite | SPEC-303, ADR-0059, ADR-0131, ADR-0138, ADR-0268, ADR-0269 |
| [ADR-0271](ADR-0271-contrats-et-integration-provisoires-de-la-coquille.md) | Contrats et intégration provisoires de la coquille | Déduite | SPEC-304, SPEC-305, SPEC-603, SPEC-606, SPEC-618, SPEC-723, ADR-0075, ADR-0162 |
| [ADR-0273](ADR-0273-socle-d-accessibilite-partage-et-galerie-de-demonstration.md) | Socle d’accessibilité partagé et galerie de démonstration | Déduite | SPEC-309 |
| [ADR-0272](ADR-0272-pages-systeme-et-layout-d-authentification-frontiere-d-erreur-404-selon-session-et-panneau-partage.md) | Pages système et layout d'authentification : frontière d'erreur, 404 selon session et panneau partagé | Déduite | SPEC-308, SPEC-006, SPEC-202, SPEC-303, SPEC-601, ADR-0034, ADR-0047, ADR-0268, ADR-0270 |
| [ADR-0274](ADR-0274-en-tete-fige-dto-dedie-cloche-sans-panneau-et-declencheur-du.md) | En-tête figé : DTO dédié, cloche sans panneau et déclencheur du menu dans l'en-tête | Déduite | SPEC-305, SPEC-304, SPEC-306, SPEC-307, SPEC-618, SPEC-707, ADR-0075, ADR-0271, ADR-0265 |
| [ADR-0275](ADR-0275-panneau-des-notifications-instantane-groupe-cote-service-et-.md) | Panneau des notifications : instantané groupé côté service et lecture avant navigation | Déduite | SPEC-306 |
| [ADR-0276](ADR-0276-recherche-globale-panneau-non-modal-et-page-rendue-cote-serveur.md) | Recherche globale : panneau non modal et page rendue côté serveur | Déduite | SPEC-307, SPEC-305, SPEC-212, SPEC-303, ADR-0034, ADR-0270, ADR-0274 |
| [ADR-0277](ADR-0277-complements-d-implementation-du-socle-du-moteur.md) | Compléments d'implémentation du socle du moteur | Déduite | SPEC-401, ADR-0020, ADR-0140, ADR-0047, ADR-0254 |
| [ADR-0278](ADR-0278-contrats-d-implementation-de-la-repetition-espacee-fsrs.md) | Contrats d’implémentation de la répétition espacée FSRS | Déduite | SPEC-402, ADR-0025, ADR-0140, ADR-0242 |
| [ADR-0280](ADR-0280-durees-derivees-et-identifiants-du-planificateur.md) | Durées dérivées et identifiants du planificateur | Déduite | SPEC-407 |
| [ADR-0281](ADR-0281-complements-d-implementation-de-la-serie-et-des-jalons.md) | Compléments d'implémentation de la série et des jalons | Déduite | SPEC-409, ADR-0033, ADR-0047, ADR-0140 |
| [ADR-0282](ADR-0282-complements-d-implementation-de-la-detection-des-lacunes.md) | Compléments d’implémentation de la détection des lacunes | Déduite | SPEC-404, ADR-0024 |
| [ADR-0283](ADR-0283-complements-d-implementation-de-la-retention-et-des-indicateurs-de-progression.md) | Compléments d'implémentation de la rétention et des indicateurs de progression | Déduite | SPEC-408, BR-MEM-06, BR-PRO-01, ADR-0210, ADR-0047, ADR-0140 |
| [ADR-0284](ADR-0284-contrats-d-implementation-du-tirage-d-une-tentative.md) | Contrats d’implémentation du tirage d’une tentative | Déduite | SPEC-405, SPEC-611, ADR-0014, ADR-0143, ADR-0170 |
| [ADR-0286](ADR-0286-complements-d-implementation-de-la-selection-de-l-echauffement.md) | Compléments d’implémentation de la sélection de l’échauffement | Déduite | SPEC-410, SPEC-714, ADR-0148, ADR-0140, ADR-0047 |
| [ADR-0287](ADR-0287-contrats-d-implementation-du-tirage-de-la-session-de-quiz-gl.md) | Contrats d’implémentation du tirage de la session de quiz global | Déduite | SPEC-406, BR-MEM-03, BR-MEM-04, ADR-0015, ADR-0025 |
| [ADR-0288](ADR-0288-contrats-d-implementation-des-services-de-persistance-du-mot.md) | Contrats d'implémentation des services de persistance du moteur | Déduite | SPEC-411, ADR-0112, ADR-0149, ADR-0242, SPEC-203 |
| [ADR-0289](ADR-0289-contrats-d-implementation-complementaires-du-paquet-bricks.md) | Contrats d'implémentation complémentaires du paquet bricks | Déduite | SPEC-501 |
