# 07 — Architecture des domaines métier

Les domaines ci-dessous sont déduits des services, DB, jobs, tests et business rules. Ce sont des frontières recommandées à tester, pas une décision d’organisation des équipes.

| Contexte | Responsabilité / données possédées | Use cases | Dépendances | Événements / exécution |
|---|---|---|---|---|
| Identity & Access | profils, préférences, credentials et memberships | inscription, onboarding, compte, groupes | IdP adapter, DB, email | signed_up, onboarding_completed; sync + async |
| Formation & Programme | formation, objectifs, cadrage, programme, modules, chapitres, notions | créer, cadrer, importer/générer/valider, pause, partager | Identity query, Tutor, recherche | programme_requested/imported/validated; génération async |
| Learning State & Planning | progress, mastery, gaps, FSRS, sessions, agenda/streaks | quiz global, planning, déplacer, answer review, unlock | Formation query, Assessment event | review_answered, gap_detected/cleared; pure + transaction |
| Content & Retrieval | resources, file lifecycle, chunks, indexes, provenance | upload, extraction, embedding, search, delete | Storage, parser, embedder, DB | resource_uploaded/ready/failed; async |
| Tutor & Conversations | conversations, contexte, messages, tool registry | ask, stream, proposer action, remédiation | Learning/Content read ports, LLM | tutor_question_asked; stream + async |
| Assessments | banques, bricks, attempts, answers, grades | démarrer, enregistrer, soumettre, corriger | Tutor pour réponses ouvertes; Learning command | quiz_submitted/graded, exam_submitted |
| Engagement | notifications et configs/état automatismes | rappeler, digest, proposer/annuler action | événements domaine, adapters email/push | notification_requested/delivered, automation_* |
| Billing & Entitlements | droit d’accès produit, abonnement et facturation | checkout, portal, webhook, réserve IA | Stripe, fournisseurs IA | subscription_changed, payment_failed, usage |
| Privacy & Accounts | exports, suppression, rétention | exporter, supprimer, désinscrire, purger | owner ports, Storage, Auth | export/deletion_requested; workflow durable |

## Données observées

- identity.ts : profiles, study/notification/automation preferences, pauses, push subscriptions.
- formations.ts : formations, modules, chapters, notions, progress.
- resources.ts : resources et chunks, owner/formation/chapter, vector 1024.
- courses.ts : course, sections, read progress, conversations/messages.
- bricks-activities.ts : question bricks, attempts/responses/grades.
- memory.ts : cartes, notion states et reviews.
- planning.ts : slots et schedules.
- notifications.ts : notification et delivery state.
- groups.ts : groupes et memberships; programme partagé avec accès asymétrique.
- ai-billing.ts : credentials/provider choices/usage/reservations.
- privacy-search.ts : idempotence, limits, exports et search.

Confirmer les clés étrangères, contraintes et ownership dans DB schema, migrations et RLS matrix; ne pas inférer les frontières uniquement par noms de fichiers.

## Événements et invariants

Les événements sont des faits post-commit, immuables et versionnés; transaction outbox avec event ID, aggregate ID/version, actor/tenant, horloge injectée, payload schema version. Exclure secrets et prompts complets. Les consumers enregistrent event ID/effect key.

Learning possède transitions FSRS et gaps dérivés des évaluations. Assessment possède la vie des attempts et appelle l’application pour mettre à jour learning. Tutor propose mais ne décide pas des permissions ou writes. Automation respecte accord et undo. Suppression appelle chaque contexte et attend confirmations d’effacement.

## Sync et async

Synchronous: auth, CRUD standard, sauvegarde réponses, lecture, correction peu coûteuse. Asynchronous: génération de cours, OCR/extraction lourde, embeddings par lot, export/suppression, notifications/digest et planning périodique. Tutor SSE débute en requête, mais nécessite run/status persistant si reprise attendue.

## Règles de dépendance

Interfaces → Application → Domain. Infrastructure implémente ports. Les domaines partagent des IDs/horloge minimes, pas ORM models. Projections/read models explicites. L’éventuelle cohérence différée doit être visible dans l’état API; une resource n’est pas ready avant cohérence chunks/métadonnées.
