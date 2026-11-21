---
id: SPEC-MIGRATION
title: Migration complète vers une API Python headless organisée par domaines
phase: PM
priority: V1
depends_on: []
business_rules: []
screens: []
adrs: [ADR-1001, ADR-1002, ADR-1003, ADR-1006, ADR-1007, ADR-1008, ADR-1009]
visual: demo
---

# SPEC-MIGRATION — Migration complète vers une API Python headless organisée par domaines

## 1. Objectif

Remplacer progressivement le runtime backend TypeScript par une API Python headless, des workers Python et un contrat indépendant des clients, sans perte de comportement, de données, de sécurité ni de capacité de retour arrière. La migration est suivie sous un seul identifiant SDD, `SPEC-MIGRATION`; ses lots ordonnés sont des jalons internes et ne créent pas de spécifications supplémentaires.

## 2. Contexte

L'audit de référence est `docs/architecture/python-headless-migration/README.md` et ses documents 01 à 15, en particulier l'état actuel (02), l'inventaire OpenAPI (02b), l'architecture cible (04), le contrat (06), les domaines (07), la sécurité (11) et la stratégie de migration (10). Relire aussi `docs/product/business-rules.md`, `docs/architecture/{overview,data-model,api,ai}.md`, `docs/engineering/{sdd-process,conventions,testing,git}.md` et les ADR cités en section 15. Les règles métier, politiques RLS, contrats visibles et comportement validé sont normatifs.

Le catalogue historique P10–P13 décrit une autre trajectoire basée sur Hono. Cette spécification devient l'unique travail actif de migration Python; elle ne supprime ni ne réécrit les anciens fichiers, preuves, commits ou décisions. Le lot 0 doit établir leur statut, réconcilier la branche `main`, les worktrees, le code, le catalogue et les preuves, puis enregistrer les ADR nécessaires avant toute décision contradictoire avec les ADR existants. La migration ne commence qu'après le checkpoint CP-8 de la piste produit.

## 3. Dépendances

- **Checkpoint CP-8** — livraison V1 validée sur `main`; le catalogue rend cette spécification exécutable uniquement après ce checkpoint.
- **Dépôt et dossiers d'audit** — reprendre le code, fixtures, scripts, rapports et 217 opérations OpenAPI inventoriées; le lot 0 vérifie l'écart avec les 219 routes du rapport d'audit au lieu de supposer ces nombres équivalents.
- **PostgreSQL, Supabase Auth, Storage et RLS** — conserver le modèle de données et les politiques en place au début. Toute évolution de schéma ou de fournisseur nécessite un ADR, une stratégie compatible et une preuve de restauration.
- **Clients** — le web Next.js reste un client; les contrats OpenAPI génèrent ou valident son SDK. Les clients natifs et tiers sont validés avec un client simulé sans cookie.
- **Services externes** — fournisseurs IA, paiements, messagerie, stockage, recherche et orchestration de tâches sont derrière des ports. Les tests utilisent adaptateurs déterministes/mocks. Une intégration réellement inaccessible est signalée par le mécanisme SDD sans prétendre qu'elle a été validée.

## 4. Règles métier couvertes

Aucune règle `BR-*` nouvelle. Toutes les règles existantes applicables restent actives et leur couverture est conservée: identité et propriété des données, accès membre, progression, évaluation, consentement aux automatismes, facturation, confidentialité, suppression, rétention et traitement IA. Le lot 0 produit une matrice reliant chaque route et job aux règles, acteurs, tables, événements et tests existants; une règle sans propriétaire ou preuve bloque le lot concerné.

## 5. Exigences fonctionnelles

- **EF-1** — À la fin, chaque route, webhook, flux SSE, tâche planifiée et consommateur couvert par l'inventaire possède un propriétaire d'exécution Python ou une exception explicitement acceptée par ADR; aucun appel ne disparaît silencieusement.
- **EF-2** — Les réponses, erreurs publiques, statuts, autorisations, règles d'idempotence et effets métier observables restent compatibles avec les contrats et règles existants, sauf changement produit séparé accepté par ADR.
- **EF-3** — Le web s'authentifie auprès de l'API à travers son relais documenté et un client Bearer simulé peut accéder aux opérations prévues sans cookie ni accès direct à la base.
- **EF-4** — Chaque domaine expose des cas d'usage partagés par HTTP, SSE, webhooks, workers et tâches planifiées; aucune interface ne réimplémente les règles métier.
- **EF-5** — Le cutover peut être arrêté ou inversé selon un runbook éprouvé, avec un seul écrivain actif à chaque instant et sans perte de mutations ni d'événements.
- **EF-6** — Une fois le cutover accepté, le runtime backend TypeScript visé et ses tâches sont retirés; les clients TypeScript, le SDK généré et le code frontend nécessaire restent en place.

## 6. Exigences techniques

- **ET-1** — API Python sous forme de monolithe modulaire ASGI; framework et versions exactes sont fixés par ADR après un POC comparant le dépôt, le streaming/SSE, l'authentification, l'exploitation et les contraintes mesurées. FastAPI est candidat, non présélectionné comme décision acquise.
- **ET-2** — Chaque contexte suit `domain → application → infrastructure`: domaine pur sans framework, ORM, fournisseur ou queue; application porte use cases, contrôles d'accès, transactions et ports; infrastructure implémente ces ports. Les imports de domaine sont contrôlés automatiquement.
- **ET-3** — Contextes initiaux: Identity & Access; Formation & Programme; Learning State & Planning; Content & Retrieval; Tutor & Conversations; Assessments; Engagement; Billing & Entitlements; Privacy & Accounts. La propriété des tables, commandes et événements est documentée. Pas de module par écran ni d'accès direct aux modèles ORM d'un autre domaine.
- **ET-4** — Contrat OpenAPI versionné et source du SDK client; schémas d'erreur, pagination, authentification, SSE, webhooks, compatibilité et politique de version sont vérifiés en CI. Les écarts de contrat sont explicites et classés.
- **ET-5** — Python s'installe de manière reproductible avec workspace/lockfile, formatage, lint, vérification de types, tests et image reproductible. CI construit et valide API et workers sans rendre le build web dépendant du venv.
- **ET-6** — PostgreSQL conserve RLS et les identités de requête authentifiées. Les claims d'acteur/tenant sont transmis explicitement à chaque transaction; clé privilégiée limitée aux usages listés, testés et audités. L'API ne fait confiance ni à un `userId` fourni par le client ni aux seuls en-têtes relayés.
- **ET-7** — UoW/transactions couvrent les écritures cohérentes. Événements publiés après commit via outbox ou mécanisme équivalent, versionnés, dédupliqués et rejouables; consumers tolèrent livraison au moins une fois. Les workers appellent les use cases applicatifs directement, sans HTTP interne.
- **ET-8** — Horloge injectable compatible avec l'horloge SDD figée; aucun `Date.now()`/`new Date()` métier hors de l'abstraction. Journaux structurés avec identifiant de requête, traces/métriques et redaction de secrets, données personnelles et prompts.
- **ET-9** — API et workers peuvent être déployés et redémarrés séparément depuis la même version; readiness, liveness, arrêt gracieux, limites de connexion, délais, retries et tâches singleton sont spécifiés et observables.
- **ET-10** — La bascule emploie ownership de routes, feature flags/canary ou méthode équivalente, comparaison en lecture et déploiement backward-compatible. Jamais deux écrivains métier simultanés. DB et événements restent lisibles pendant le rollback.

## 7. Comportements attendus et cas limites

- **CL-1** — Inventaire de route incomplet ou route sans test : arrêter le cutover du domaine, compléter l'inventaire; ne pas traiter l'absence d'opération comme une route migrée.
- **CL-2** — Jeton absent, expiré, mauvais issuer/audience, claim incohérent ou utilisateur usurpé : refus sans accès aux données privées; clé privilégiée n'est jamais choisie à partir de l'entrée utilisateur.
- **CL-3** — Requête d'un autre propriétaire ou membre insuffisant : conserver les réponses de non-divulgation et résultats RLS attendus; tester aussi le chemin service-role explicitement autorisé.
- **CL-4** — Livraison dupliquée, timeout après commit, retry ou worker tué : un effet métier logique, reprise observable et aucun événement perdu; les effets externes utilisent une clé de déduplication ou compensation.
- **CL-5** — SSE interrompu/reconnecté, client lent ou annulé : fermer proprement les ressources, ne pas répéter un effet, respecter le protocole et l'état de reprise contractés.
- **CL-6** — Python, DB, queue, fournisseur IA, stockage ou paiement indisponible : délais bornés, erreur stable, données validées préservées et retry sûr; comportement mock couvert sans fausse preuve de disponibilité tierce.
- **CL-7** — Déploiement partiel, contrat client ancien, migration DB échouée ou métrique de canary hors seuil : bloquer la promotion ou appliquer le rollback avant toute bascule d'écriture.
- **CL-8** — Une bascule/rollback survient pendant mutations en attente : drainer ou rejouer les opérations avec leurs clés; établir la cohérence des données et de l'outbox avant réouverture.
- **CL-9** — Données de temps, fuseau, valeurs nulles et réponses IA structurées : garder les sémantiques et résultats de référence, utiliser l'horloge injectée et valider toute sortie non fiable.

## 8. Instructions d'implémentation

Tous les travaux et commits utilisent `SPEC-MIGRATION`; les lots ci-dessous sont des gates internes dans cette seule spécification. Chaque lot produit une note de preuve incrémentale sous `evidence/SPEC-MIGRATION/`, garde le système compilable/déployable, et rejoue les tests touchés. Ne commencer le lot suivant qu'après fermeture de ses critères internes. Les choix incompatibles avec les ADR sont d'abord arbitrés et consignés en ADR.

1. **Lot 0 — Réconciliation et décisions.** Vérifier `main`, worktrees, branches, CP-8, statut et dérive P10–P13, inventaire de routes/jobs, policies RLS, dépendances, contrats, tests et statut réel du code. Déterminer explicitement ce qui est historique, réutilisable ou à remplacer sans réécrire l'historique. Établir baseline reproductible de comportements, erreurs, données et coûts/latences mesurables. Enregistrer ADR d'architecture, framework, connexion/auth, persistance, workflow, API/SDK, déploiement, cutover et rollback nécessaires; aucune implémentation avant les décisions bloquantes.
2. **Lot 1 — Socle Python et contrat.** Créer workspace verrouillé, CI, app factory, OpenAPI source/versionné, adaptateurs ASGI, health/readiness, erreurs stables, logs/traces, limites et SDK TypeScript généré. Ajouter les contrôles de compatibilité de contrat et de frontières d'import. Ne modifier aucun comportement fonctionnel.
3. **Lot 2 — Connexion, identité et données.** Brancher PostgreSQL/Supabase avec pool et UoW, authentification cookie/Bearer, vérification JWT/JWKS selon ADR, ActorContext, RLS, Storage et secrets côté serveur. Établir tests d'isolation pour toutes les tables touchées, contrôle des privilèges, transaction, rotation de clés et raccordement du relais web. Garder l'application TypeScript comme propriétaire des écritures jusqu'à l'étape de cutover de chaque lot.
4. **Lot 3 — Services de domaine et workers.** Mettre en place les neuf contextes ET-3, ports, événements/outbox et conventions. Migrer les use cases par verticaux ordonnés: identité/formation/programme; apprentissage/planification/évaluations; contenu/ingestion/recherche; tuteur/IA; engagement/automatisations; facturation/confidentialité. Pour chaque vertical, porter les fixtures/oracles, autorisations et transitions existantes; raccorder le worker au même service applicatif.
5. **Lot 4 — Migration des routes par lots métier.** Pour chaque domaine, lister toutes opérations, middlewares, erreurs, effets et tests; porter les routes, webhooks et flux SSE en lots atomiques. Faire tourner des comparaisons contractuelles et des lectures shadow sans duplication d'écriture. À chaque lot, produire une matrice route/job → use case → règle/acteur → données → test, puis obtenir zéro divergence inexpliquée avant de poursuivre.
6. **Lot 5 — Connexion des clients et bascule.** Raccorder le relais et SSR Next au SDK généré, migrer l'authentification, cookies, SSE et erreurs. Tester le client web et un client Bearer externe simulé. Basculer domaine par domaine avec un écrivain à la fois, canary/observabilité, seuils de promotion définis par ADR, procédure d'arrêt et exercice de rollback avec réconciliation DB/outbox.
7. **Lot 6 — Non-régression et retrait.** Exécuter validations unitaires, intégration, contrat, e2e et visuelles complètes, navigateurs, accessibilité, sécurité, performance/charge, résilience/reprise, backup/restore et runbooks. Mesurer les seuils approuvés dans les ADR; traiter chaque écart. Supprimer seulement ensuite le runtime backend/worker TypeScript devenu inutilisé, ses variables et déploiements; garder packages front/client explicitement nécessaires. Refaire l'inventaire pour prouver l'absence d'appels et chemins résiduels.
8. **Clôture SDD.** Compléter tous les CA, la matrice de parité, l'acceptance.md et les rapports de lot; lancer `node tools/sdd/validate.mjs SPEC-MIGRATION`, puis le checkpoint CP-MIGRATION. Réconcilier suivi/documentation et fermer la piste seulement avec preuves commitables et rollback opérationnel documenté.

## 9. Fichiers et composants concernés

- **Créés** — workspace Python (`pyproject.toml`, lockfile), `apps/api/`, `apps/worker/`, modules domaine/application/infrastructure, `api/openapi.yaml`, génération/validation SDK, adaptateurs et tests contractuels, contrôles d'architecture, workflows CI et runbooks; chemins exacts confirmés par ADR et consignés dans chaque lot.
- **Modifiés** — relais/SSR/auth/client API web, CI, Docker et déploiement, contrats/types générés, configuration et documentation; routes Next et workers seulement au retrait correspondant.
- **Lus/réutilisés** — `apps/api` et `apps/web`, `packages/contracts`, `api-client`, `http`, `api-routes`, `services`, `db`, `llm`, `tutor`, `ingestion`, `jobs`, `notifications`, `automations`, `learning-engine`, tests, migrations SQL/RLS, événements et fixtures.
- **Intouchables** — `design/maquettes/` et `docs/legacy/`; migrations de schéma et données sans étape rétrocompatible et backup restauré prouvé.

## 10. Interface et conformité visuelle

La migration ne change pas les parcours ni les maquettes. Aucun écran nouveau de production n'est requis; les pages web existantes doivent garder textes, structure, responsive, focus et états d'erreur. Le mode de validation est `demo` pour le rapport SDD; les tests visuels existants tournent contre le serveur connecté au backend Python à contrat équivalent. Capturer les mêmes scénarios et comparer aux références selon `docs/engineering/testing.md` §6; aucune baseline ne peut être régénérée pour masquer un écart. Tester axe/WCAG 2.2 AA sur les parcours modifiés.

## 11. Critères d'acceptation

- **CA-1** — Matrice exhaustive de toutes routes, jobs, webhooks, SSE et règles applicable; chaque entrée a implémentation cible, propriétaire, permissions et test, et aucune divergence de couverture entre inventaire source et rapport n'est inexpliquée.
- **CA-2** — Contrat OpenAPI valide et versionné; vérification automatisée prouve parité des opérations, formats, erreurs, sécurité et événements avec la baseline ou chaque écart est relié à un ADR et accepté avant cutover.
- **CA-3** — La matrice RLS passe pour anonyme, utilisateur propriétaire, autre utilisateur, membre autorisé/non autorisé et service-role explicitement permis; tests vérifient qu'aucune identité ou privilège ne vient d'une entrée non fiable.
- **CA-4** — Chaque domaine suit les frontières d'import; les use cases exécutés par HTTP, SSE et worker utilisent la même logique et passent les oracles de comportement du backend actuel.
- **CA-5** — Chaque lot de route/job migré a zéro divergence inexpliquée en tests contractuels, shadow reads et matrice de parité; chaque mutation est attribuée à un seul écrivain et chaque événement est dédupliqué/rejouable.
- **CA-6** — Tous les parcours e2e/visuels existants et parcours API supplémentaires passent, incluant web, client Bearer sans cookie, SSE, auth, erreurs, accessibilité et navigateurs requis; les vidéos/captures et rapports sont présents.
- **CA-7** — Les budgets performance, capacité, sécurité, disponibilité et coûts définis par ADR sont mesurés dans un environnement décrit; aucun seuil non mesuré n'est déclaré atteint.
- **CA-8** — Un exercice documenté de backup/restore et de rollback après canary démontre cohérence des données et de l'outbox, continuité des événements, un seul écrivain et retour au service sous les objectifs approuvés.
- **CA-9** — Après cutover, aucun chemin de production n'exécute le backend ou worker TypeScript destiné au retrait; le frontend, SDK et paquets TypeScript conservés ont des propriétaires et usages recensés.
- **CA-10** — `validate.mjs` et CP-MIGRATION passent, `evidence/SPEC-MIGRATION/acceptance.md` a une preuve vérifiable par CA, documentation/runbooks sont à jour et aucune régression n'est ouverte.

## 12. Plan de tests

Chaque test est ajouté dans le lot qui introduit le comportement. Les commandes sont exécutées par les agents de la spécification au moment de l'implémentation; cette création de SDD ne constitue pas une validation.

- **Unitaires** — pytest par paquet `[SPEC-MIGRATION]`: règles pures de domaines, validation, transitions, erreurs, horloge injectée, idempotence, permissions applicatives, sorties IA structurées; tests de propriétés et fixtures-oracles du TypeScript.
- **Architecture** — vérifier imports autorisés `domain → application → ports`, absence de framework/ORM/provider dans domaine, interdiction de requêtes SQL d'un autre domaine et que les workers appellent les use cases sans HTTP.
- **Intégration** — PostgreSQL/Supabase local: transactions rollback/commit, isolation RLS propriétaire/autre/membre/anonyme/service, Auth/JWKS, Storage, outbox, migrations backward-compatible, concurrence, retries après crash, deduplication, redelivery et restauration.
- **Contrats** — OpenAPI lint/schema, comparaison breaking/non-breaking, toutes opérations et exemples, SDK régénéré proprement, client web compile, formats erreurs/pagination/auth, webhook signatures, SSE events/disconnect/reconnect; appel par appel pour chaque lot.
- **E2E API** — tests avec `@SPEC-MIGRATION` et vidéo: santé, connexion cookie relayée, Bearer sans cookie/Origin, permission refusée, parcours de chaque domaine, jobs async, SSE, perte réseau, reprise et canary/rollback.
- **E2E web** — parcours fonctionnels existants via API Python (inscription/onboarding, programme, cours, quiz/révisions, ingestion/tuteur, paramètres, notifications et privacy) sur les navigateurs de la suite; pas de changement produit implicite.
- **Visuel/accessibilité** — `@SPEC-MIGRATION @visual`; mêmes viewport, seed et horloge fixe, captures versus baseline sans regénération, responsive et axe/WCAG sur tous les écrans affectés.
- **Sécurité** — tests authN/authZ, usurpation d'identité, JWT expiré/mauvais issuer/audience, SSRF, injection, limites, secrets/log redaction, CORS, CSRF/cookies/proxy trust, webhooks, rate limiting, abus SSE, fuite cross-tenant et permissions service-role.
- **Résilience et performance** — charge HTTP/DB, concurrence et pool, latence SSE, backpressure, démarrage/arrêt, pannes DB/queue/provider, livraison dupliquée, worker tué/redémarré, queues retardées, déploiement partiel; comparer aux seuils ADR et archiver mesures brutes.
- **Non-régression** — toutes suites antérieures affectées, lint, typecheck, build, audit SDD, tests produit complets, cross-browser, tests de charge et procédures opérationnelles au checkpoint.

Traçabilité minimale: CA-1 → audit d'inventaire; CA-2 → validation OpenAPI/SDK/contract; CA-3 → matrice RLS/Security; CA-4 → tests architecture + oracles domaine; CA-5 → parity/shadow/idempotence; CA-6 → e2e, visuels et axe; CA-7 → résultats perf/charge/sécurité; CA-8 → exercice restore/rollback; CA-9 → scan runtime/route/job et dépendances; CA-10 → `validate.mjs`, acceptance et CP-MIGRATION.

## 13. Preuves attendues

Dans `evidence/SPEC-MIGRATION/`: `acceptance.md` avec CA cochés et liens, rapport inventaire route/job/règle, ADR et matrice de décision, baseline comparée, matrice RLS, rapports OpenAPI/SDK, parité pour chaque lot, résultats d'intégration et de tests, vidéos/captures visuelles, résultats axe, mesures brutes charge/latence, audit de sécurité, manifests d'image, logs des scénarios de panne, preuves backup/restore et rollback, runbooks et inventaire prouvant le retrait. Toute preuve porte date/environnement/commande/commit; aucune valeur théorique n'est présentée comme mesure.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 et les validations obligatoires du référentiel s'appliquent intégralement: lint, typecheck, build, tests unitaires, intégration, e2e avec vidéo, visuel, accessibilité, sécurité, performance et critères acceptés avec preuves. En plus, tous les lots 0–6 sont fermés dans l'ordre, les ADR bloquants sont commités, CA-1 à CA-10 prouvés, aucune route/job métier n'est non attribuée, aucune divergence ou régression n'est ouverte, l'exercice rollback/restore passe et le checkpoint CP-MIGRATION est vert. Aucun service tiers inaccessible ne peut être marqué réussi; le mode mock couvre les travaux indépendants et le blocage est consigné selon le processus SDD.

## 15. Décisions et hypothèses

- **ADR existants à relire** — ADR-1001 (invariants de migration), ADR-1002 (Hono), ADR-1003 (latence SSR), ADR-1006 (piste et checkpoints), ADR-1007 (partage contrats/services), ADR-1008 et ADR-1009 (étapes de transition). Le lot 0 doit relever précisément le conflit avec une API Python; les ADR existants gardent priorité jusqu'à ce qu'un ADR ultérieur les remplace explicitement. Ne pas appliquer silencieusement les hypothèses d'architecture Hono.
- **ADR requis dans le lot 0** — décision de migration/bénéfice et trajectoire de branche, runtime/framework Python, frontières de domaine et structure de workspace, identité/connexion/RLS et stratégie DB, contrat/OpenAPI/SDK, workers/workflow/outbox, déploiement/observabilité, méthode de migration par lot, cutover/rollback, seuils de performance et critères de retrait. `adr.mjs` attribue les numéros; les liens vers cette spécification sont ajoutés au catalogue et ici avant implémentation concernée.
- **Hypothèses** — PostgreSQL, schéma et règles produit restent le socle initial; FastAPI, SQLAlchemy, uv et remplacement ou conservation d'Inngest demeurent options jusqu'aux décisions et POC; pas de microservices ni refonte fonctionnelle dans ce périmètre.
- **Périmètre exclu** — refonte visuelle ou de règles produit, migration de base à nouveau fournisseur sans ADR, fonctionnalités client mobile de production, exposition publique de MCP, évolution de maquettes et retrait de code encore utilisé par le frontend.
- **Historique SDD** — P10–P13 et leurs preuves sont archivés comme trajectoire Hono; `SPEC-MIGRATION` est l'unique spec active pour l'objectif Python. Ils ne doivent pas être démarrés en parallèle de cette migration ni supprimés/réécrits par cette spécification.
