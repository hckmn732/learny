# Annexe 02b - Inventaire des operations OpenAPI

Source: apps/api/openapi.json at commit 6881478a. Reconcile with ROUTES in packages/contracts/src/routes.ts and ROUTE_IMPLEMENTATIONS in packages/api-routes/src/tables.ts.

OpenAPI operations: 217. migration report reports 219 route registry entries. Explain the 2-operation gap before treating OpenAPI as exhaustive.

| Domain | Method | Path | operationId | Published summary |
|---|---|---|---|---|
| - | GET | /api/v1/agenda | agenda.get | Agenda de l’apprenant : créneaux d’une période civile (42 jours au plus) dans son fuseau, bornes de navigation, période de la légende et totaux (SPEC-704). |
| - | GET | /api/v1/attempts/{aid} | quiz.attempts.get | Renvoie une tentative de quiz sans révéler les bonnes réponses non vérifiées (SPEC-611). |
| - | PUT | /api/v1/attempts/{aid}/answers/{pos} | quiz.answers.save | Enregistre le brouillon d’une réponse non vérifiée (SPEC-611). |
| - | POST | /api/v1/attempts/{aid}/answers/{pos}/check | quiz.answers.check | Vérifie immédiatement une réponse corrigée par le code ou verrouille une réponse ouverte (SPEC-611). |
| - | GET | /api/v1/attempts/{aid}/result | quiz.attempts.result | Renvoie le résultat complet d’une tentative corrigée : score, seuil, lacunes, acquis, historique, nouvelle tentative et remédiation (SPEC-612). |
| - | POST | /api/v1/attempts/{aid}/submit | quiz.attempts.submit | Soumet la tentative, lance la correction des ouvertes et réémet la correction si elle est en attente (SPEC-611). |
| - | GET | /api/v1/auth/callback | auth.callback | Vérifie le lien reçu par e-mail, pose la session et redirige. |
| - | POST | /api/v1/auth/magic-link | auth.magicLink | Envoie un lien magique de connexion ou d’inscription. |
| - | POST | /api/v1/auth/resend | auth.resend | Renvoie le lien de confirmation ou de connexion (un par minute). |
| - | POST | /api/v1/auth/sign-in | auth.signIn | Connecte par e-mail et mot de passe ; renvoie la destination. |
| - | POST | /api/v1/auth/sign-out | auth.signOut | Ferme la session (idempotent, 204 même sans session). |
| - | POST | /api/v1/auth/sign-up | auth.signUp | Crée un compte par e-mail et mot de passe (confirmation obligatoire). |
| - | POST | /api/v1/billing/checkout | billing.checkout | Ouvre une session Stripe Checkout pour l’abonnement à l’application. |
| - | POST | /api/v1/billing/portal | billing.portal | Ouvre le portail client Stripe (moyen de paiement, résiliation). |
| - | GET | /api/v1/billing/subscription | billing.subscription | Abonnement de l’apprenant : droit d’utiliser l’application, gratuit par défaut. |
| - | PATCH | /api/v1/bricks/{bid} | bricks.correct | Corrige une brique du seul utilisateur connecté en créant une nouvelle version (SPEC-501). |
| - | POST | /api/v1/bricks/{bid}/report | bricks.report | Signale une brique du seul utilisateur connecté, la retire des tirages et renvoie le signalement ouvert (SPEC-501). |
| - | POST | /api/v1/chapters/{cid}/complete | chapters.complete | Déclare les apports du chapitre terminés (ou les rouvre) et demande la génération quand le module est complet (SPEC-607). |
| - | POST | /api/v1/chapters/{cid}/resources | resources.create | Crée un apport sans fichier : note, page web ou vidéo YouTube (SPEC-206). |
| - | POST | /api/v1/chapters/{cid}/summary | chapters.summary | Enregistre le résumé d’un chapitre, le fait corriger par le tuteur et signale ce qui manque (SPEC-609). |
| - | POST | /api/v1/chapters/{cid}/uploads | uploads.create | Réserve un apport fichier et renvoie une URL d’envoi signée de dix minutes (SPEC-206). La clé Idempotency-Key est obligatoire. |
| - | GET | /api/v1/conversations/{id} | conversations.get | Relit une discussion et son contexte courant (SPEC-610). |
| - | POST | /api/v1/conversations/{id}/messages | conversations.messages | Envoie une question et diffuse la réponse du tuteur en flux SSE (SPEC-610). |
| - | POST | /api/v1/conversations/{id}/self-test/answer | conversations.self-test.answer | Corrige la réponse à une question Teste-moi et applique la maîtrise (SPEC-610). |
| - | GET | /api/v1/course-citations/{cid}/source | course-citations.source | Résout le lien contrôlé d’une citation (page PDF, minute vidéo, ancre web) pour son propriétaire (SPEC-609). |
| - | GET | /api/v1/courses/{cid}/conversations | courses.conversations.list | Liste les discussions privées d’un cours (SPEC-610). |
| - | POST | /api/v1/courses/{cid}/conversations | courses.conversations.create | Ouvre une discussion avec le tuteur sur un chapitre du cours (SPEC-610). |
| - | PUT | /api/v1/courses/{cid}/progress | courses.progress | Enregistre la progression de lecture d’un chapitre sans jamais la faire reculer (SPEC-609). |
| - | PATCH | /api/v1/course-sections/{sid} | course-sections.edit | Corrige ou complète une section du cours en créant la version suivante (SPEC-609). |
| - | POST | /api/v1/course-sections/{sid}/report | course-sections.report | Signale une section du cours et la retire des nouveaux tirages jusqu’à correction (SPEC-609). |
| - | GET | /api/v1/dev/sdd/api/coverage | dev.sddApiCoverage | Couverture des routes servies par apps/api (SPEC-1101). |
| - | POST | /api/v1/dev/sdd/auth/proxy | dev.sddAuthProxy | Mutation de démonstration du relais authentifié (SPEC-1102). |
| - | POST | /api/v1/dev/sdd/cron/hourly-tick | dev.cron.hourlyTick | Route de démonstration : exécute le tick horaire et liste les utilisateurs de fabrique sélectionnés (SPEC-203). |
| - | POST | /api/v1/dev/sdd/echo | dev.echo | Route de démonstration : écho idempotent (SPEC-201). |
| - | DELETE | /api/v1/dev/sdd/email/outbox | dev.email.outbox.purge | Route de démonstration : vide la boîte d’envoi du transport mémoire (SPEC-204), pour des captures reproductibles. |
| - | GET | /api/v1/dev/sdd/email/outbox | dev.email.outbox | Route de démonstration : boîte d’envoi du transport mémoire (SPEC-204). |
| - | GET | /api/v1/dev/sdd/email/preview | dev.email.preview | Route de démonstration : aperçu d’un gabarit avec les données d’exemple (JSON, ou text/html sans Accept: application/json) (SPEC-204). |
| - | POST | /api/v1/dev/sdd/email/send | dev.email.send | Route de démonstration : envoie un gabarit à l’utilisateur connecté (SPEC-204). |
| - | POST | /api/v1/dev/sdd/events/demo | dev.events.demo.start | Route de démonstration : émet l’événement du pipeline à trois étapes (SPEC-203). |
| - | GET | /api/v1/dev/sdd/events/demo/{runId} | dev.events.demo.run | Route de démonstration : état d’une exécution du pipeline (SPEC-203). |
| - | GET | /api/v1/dev/sdd/events/outbox | dev.events.outbox | Route de démonstration : état de la boîte d’envoi de l’utilisateur (SPEC-203). |
| - | GET | /api/v1/dev/sdd/items | dev.items | Route de démonstration : liste paginée de 57 éléments (SPEC-201). |
| - | POST | /api/v1/dev/sdd/notifications/generate | dev.notificationsGenerate | Route de démonstration : génère les notifications des treize producteurs et un rappel de quiz (SPEC-706). |
| - | POST | /api/v1/dev/sdd/notify | dev.notify | Route de démonstration : routage unifié d’une notification (SPEC-209). |
| - | DELETE | /api/v1/dev/sdd/personal-data/deletion | dev.personal-data.deletion.cancel | Route de démonstration : annule la suppression programmée (SPEC-211). |
| - | POST | /api/v1/dev/sdd/personal-data/deletion | dev.personal-data.deletion.schedule | Route de démonstration : programme la suppression à J+30 (SPEC-211). |
| - | POST | /api/v1/dev/sdd/personal-data/execute | dev.personal-data.execute | Route de démonstration : suppression complète d’un compte jetable à J+30 (SPEC-211). |
| - | POST | /api/v1/dev/sdd/personal-data/export | dev.personal-data.export | Route de démonstration : export complet du jeu de démonstration (SPEC-211). |
| - | POST | /api/v1/dev/sdd/push/send | dev.pushSend | Route de démonstration : crée une notification de l’utilisateur courant et l’envoie par le canal push simulé (SPEC-205). |
| - | POST | /api/v1/dev/sdd/rate-limit/burst | dev.rateLimit.burst | Route de démonstration : rafale simulée sur un profil de débit (SPEC-208). |
| - | POST | /api/v1/dev/sdd/rate-limit/origin | dev.rateLimit.origin | Route de démonstration : mutation d’origine identique ou étrangère (SPEC-208). |
| - | POST | /api/v1/dev/sdd/rate-limit/purge | dev.rateLimit.purge | Route de démonstration : purge des clés et seaux périmés (SPEC-208). |
| - | GET | /api/v1/dev/sdd/SPEC-007/demo | dev.sdd.spec-007.demo | Démonstration SPEC-007 (jobs durables). |
| - | GET | /api/v1/dev/sdd/SPEC-009/demo | dev.sdd.spec-009.demo | Démonstration SPEC-009 (configuration). |
| - | GET | /api/v1/dev/sdd/SPEC-1004/demo | dev.sdd.spec-1004.demo | Démonstration SPEC-1004 (couverture des routes). |
| - | GET | /api/v1/dev/sdd/SPEC-101/demo | dev.sdd.spec-101.demo | Démonstration SPEC-101 (schéma de base). |
| - | POST | /api/v1/dev/sdd/SPEC-102/create | dev.sdd.spec-102.create | Action create de la démonstration SPEC-102. |
| - | GET | /api/v1/dev/sdd/SPEC-102/demo | dev.sdd.spec-102.demo | Démonstration SPEC-102 (identité). |
| - | POST | /api/v1/dev/sdd/SPEC-102/remove | dev.sdd.spec-102.remove | Action remove de la démonstration SPEC-102. |
| - | GET | /api/v1/dev/sdd/SPEC-103/demo | dev.sdd.spec-103.demo | Démonstration SPEC-103 (formations). |
| - | GET | /api/v1/dev/sdd/SPEC-104/demo | dev.sdd.spec-104.demo | Démonstration SPEC-104 (ressources). |
| - | GET | /api/v1/dev/sdd/SPEC-105/demo | dev.sdd.spec-105.demo | Démonstration SPEC-105 (cours). |
| - | GET | /api/v1/dev/sdd/SPEC-106/demo | dev.sdd.spec-106.demo | Démonstration SPEC-106 (briques et activités). |
| - | GET | /api/v1/dev/sdd/SPEC-107/demo | dev.sdd.spec-107.demo | Démonstration SPEC-107 (mémorisation). |
| - | GET | /api/v1/dev/sdd/SPEC-108/demo | dev.sdd.spec-108.demo | Démonstration SPEC-108 (agenda). |
| - | GET | /api/v1/dev/sdd/SPEC-109/demo | dev.sdd.spec-109.demo | Démonstration SPEC-109 (notifications). |
| - | GET | /api/v1/dev/sdd/SPEC-110/demo | dev.sdd.spec-110.demo | Démonstration SPEC-110 (IA et facturation). |
| - | GET | /api/v1/dev/sdd/SPEC-111/demo | dev.sdd.spec-111.demo | Démonstration SPEC-111 (formations partagées). |
| - | GET | /api/v1/dev/sdd/SPEC-112/demo | dev.sdd.spec-112.demo | Démonstration SPEC-112 (recherche et droits). |
| - | GET | /api/v1/dev/sdd/SPEC-113/demo | dev.sdd.spec-113.demo | Démonstration SPEC-113 (RLS). |
| - | GET | /api/v1/dev/sdd/SPEC-114/demo | dev.sdd.spec-114.demo | Démonstration SPEC-114 (stockage). |
| - | GET | /api/v1/dev/sdd/SPEC-115/demo | dev.sdd.spec-115.demo | Démonstration SPEC-115 (données de démonstration). |
| - | GET | /api/v1/dev/sdd/SPEC-1203/demo | dev.sdd.spec-1203.demo | Démonstration SPEC-1203 (frontière web). |
| - | GET | /api/v1/dev/sdd/SPEC-1301/demo | dev.sdd.spec-1301.demo | Démonstration SPEC-1301 (client natif). |
| - | GET | /api/v1/dev/sdd/SPEC-202/demo | dev.sdd.spec-202.demo | Démonstration SPEC-202 (authentification). |
| - | GET | /api/v1/dev/sdd/SPEC-411/demo | dev.sdd.spec-411.demo | Démonstration SPEC-411 (moteur pédagogique). |
| - | POST | /api/v1/dev/sdd/SPEC-501/correct | dev.sdd.spec-501.correct | Action correct de la démonstration SPEC-501. |
| - | POST | /api/v1/dev/sdd/SPEC-501/create | dev.sdd.spec-501.create | Action create de la démonstration SPEC-501. |
| - | GET | /api/v1/dev/sdd/SPEC-501/demo | dev.sdd.spec-501.demo | Démonstration SPEC-501 (briques). |
| - | POST | /api/v1/dev/sdd/SPEC-501/report | dev.sdd.spec-501.report | Action report de la démonstration SPEC-501. |
| - | POST | /api/v1/dev/sdd/SPEC-504/call | dev.sdd.spec-504.call | Action call de la démonstration SPEC-504. |
| - | GET | /api/v1/dev/sdd/SPEC-504/demo | dev.sdd.spec-504.demo | Démonstration SPEC-504 (modèles IA). |
| - | POST | /api/v1/dev/sdd/SPEC-505/create | dev.sdd.spec-505.create | Action create de la démonstration SPEC-505. |
| - | POST | /api/v1/dev/sdd/SPEC-505/delete | dev.sdd.spec-505.delete | Action delete de la démonstration SPEC-505. |
| - | GET | /api/v1/dev/sdd/SPEC-505/demo | dev.sdd.spec-505.demo | Démonstration SPEC-505 (clés personnelles). |
| - | POST | /api/v1/dev/sdd/SPEC-506/run | dev.sdd.spec-506.run | Action run de la démonstration SPEC-506. |
| - | GET | /api/v1/dev/sdd/SPEC-508/demo | dev.sdd.spec-508.demo | Démonstration SPEC-508 (tuteur). |
| - | GET | /api/v1/dev/sdd/SPEC-509/demo | dev.sdd.spec-509.demo | Démonstration SPEC-509 (ingestion documents). |
| - | GET | /api/v1/dev/sdd/SPEC-510/demo | dev.sdd.spec-510.demo | Démonstration SPEC-510 (ingestion web). |
| - | GET | /api/v1/dev/sdd/SPEC-511/demo | dev.sdd.spec-511.demo | Démonstration SPEC-511 (retrieval). |
| - | POST | /api/v1/dev/sdd/SPEC-512/decide | dev.sdd.spec-512.decide | Action decide de la démonstration SPEC-512. |
| - | GET | /api/v1/dev/sdd/SPEC-512/demo | dev.sdd.spec-512.demo | Démonstration SPEC-512 (recherche web). |
| - | POST | /api/v1/dev/sdd/SPEC-512/suggest | dev.sdd.spec-512.suggest | Action suggest de la démonstration SPEC-512. |
| - | GET | /api/v1/dev/sdd/SPEC-711/demo | dev.sdd.spec-711.demo | Démonstration SPEC-711 (automatismes). |
| - | POST | /api/v1/dev/sdd/stripe/checkout/cancel | dev.stripe.checkoutCancel | Route de démonstration : « Annuler » sur la page Checkout simulée (SPEC-210). |
| - | POST | /api/v1/dev/sdd/stripe/checkout/pay | dev.stripe.checkoutPay | Route de démonstration : « Payer » sur la page Checkout simulée (SPEC-210). |
| - | GET | /api/v1/dev/sdd/stripe/events | dev.stripe.events | Route de démonstration : historique des webhooks Stripe simulés (SPEC-210). |
| - | POST | /api/v1/dev/sdd/stripe/session | dev.sdd.stripe.session | Action session de la démonstration stripe. |
| - | POST | /api/v1/dev/sdd/stripe/simulate | dev.stripe.simulate | Route de démonstration : échec de paiement, résiliation ou rejeu simulés (SPEC-210). |
| - | POST | /api/v1/dev/sdd/uploads | dev.uploadSimulation | Route de démonstration : essais simulés des limites d’envoi (SPEC-206). |
| - | GET | /api/v1/email/unsubscribe | email.unsubscribe.page | Page de désinscription (formulaire POST) ; aucun changement d’état. |
| - | POST | /api/v1/email/unsubscribe | email.unsubscribe | Désinscription en un clic (RFC 8058) : coupe les e-mails de service ; page HTML de confirmation, ou JSON avec Accept: application/json. |
| - | PUT | /api/v1/exercises/{aid}/draft | exercises.saveDraft | Enregistre le brouillon d’une production sans correction ni appel au tuteur (SPEC-613). |
| - | POST | /api/v1/exercises/{aid}/submissions | exercises.submit | Valide la production, applique les contrôles automatiques puis rend la correction du tuteur par critère (SPEC-613). |
| - | GET | /api/v1/formations | formations.list | Liste minimale des formations du propriétaire (SPEC-604). |
| - | POST | /api/v1/formations | formations.create | Crée une formation au statut cadrage et lance la première question du tuteur (SPEC-604). |
| - | PATCH | /api/v1/formations/{fid} | formations.update | Met à jour le titre d’une formation pendant le cadrage (SPEC-604 EF-11). |
| - | GET | /api/v1/formations/{fid}/access | formations.access | Confirme avant le rendu que la formation est visible par l’apprenant (SPEC-1202). |
| - | POST | /api/v1/formations/{fid}/archive | formations.archive | Archive une formation active ou en pause, retire ses créneaux futurs et conserve son historique (SPEC-618). |
| - | GET | /api/v1/formations/{fid}/cadrage | cadrage.page | État de l’écran de cadrage, avec le statut courant de la formation (SPEC-1202). |
| - | POST | /api/v1/formations/{fid}/cadrage/complete | cadrage.complete | Conclut le cadrage et prépare la génération du programme (SPEC-604). |
| - | GET | /api/v1/formations/{fid}/cadrage/messages | cadrage.get | Historique, profil et question en attente d’un cadrage (SPEC-604). |
| - | POST | /api/v1/formations/{fid}/cadrage/messages | cadrage.message | Envoie une réponse au tuteur et renvoie le cadrage à jour (SPEC-604). |
| - | GET | /api/v1/formations/{fid}/final-review | formations.finalReview | Renvoie le bilan final d’une formation terminée : acquis, notions fragiles, carte, heures, rétention et entretien (SPEC-617). |
| - | GET | /api/v1/formations/{fid}/gaps | gaps.list | Lacunes ouvertes d’une formation avec statistiques, compteurs par nature, cartes et prochaine révision (SPEC-615). |
| - | GET | /api/v1/formations/{fid}/global-quiz/today | review.globalQuizToday | Session du jour du quiz global d’une formation, créée au premier chargement du jour (SPEC-701). |
| - | GET | /api/v1/formations/{fid}/group | formations.group.get | Lit l’état du groupe et la projection limitée des membres (SPEC-724, BR-GRP-03). |
| - | POST | /api/v1/formations/{fid}/group | formations.group.create | Crée le groupe d’une formation active : code LRN-XXXX, lien et dix places (SPEC-724, BR-GRP-01). |
| - | POST | /api/v1/formations/{fid}/maintenance | formations.maintenance | Choisit ou change l’entretien de mémoire d’une formation terminée (light ou stopped) et renvoie le bilan à jour (SPEC-617). |
| - | GET | /api/v1/formations/{fid}/mock-exams | exam.intro | Renvoie le format proposé, les modules étudiés et les prochains examens blancs (SPEC-614). |
| - | POST | /api/v1/formations/{fid}/mock-exams/attempts | exam.attempts.create | Lance un examen blanc ou reprend la tentative en cours avec son temps restant (SPEC-614). |
| - | POST | /api/v1/formations/{fid}/mock-exams/format | exam.format.confirm | Confirme le format d’examen extrait d’un guide avant de lancer une épreuve (SPEC-614). |
| - | GET | /api/v1/formations/{fid}/modules/{mid}/exercises/{aid} | exercises.detail | Renvoie l’exercice pratique, sa dernière tentative, les indices révélés et la maîtrise (SPEC-613). |
| - | GET | /api/v1/formations/{fid}/notion-graph | notionGraph.get | Graphe des notions d’une formation avec maîtrise, lacunes, apports personnels et liens typés (SPEC-616). |
| - | POST | /api/v1/formations/{fid}/pause | formations.pause | Met une formation en pause, gèle ses créneaux futurs et choisit la formation courante restante (SPEC-618). |
| - | GET | /api/v1/formations/{fid}/programme | programme.get | Proposition courante, ou programme en cours, d’une formation (SPEC-605, SPEC-606). |
| - | POST | /api/v1/formations/{fid}/programme/adjust | programme.adjust | Ajuste la proposition avec le tuteur et crée une version (SPEC-605). |
| - | POST | /api/v1/formations/{fid}/programme/generate | programme.generate | Génère une proposition de programme depuis le cadrage figé (SPEC-605). |
| - | POST | /api/v1/formations/{fid}/programme/import | programme.import | Importe un texte ou un fichier et le structure en proposition (SPEC-605). |
| - | POST | /api/v1/formations/{fid}/programme/validate | programme.validate | Active la proposition : modules, chapitres, notions et planification (SPEC-605). |
| - | POST | /api/v1/formations/{fid}/replan | formations.replan | Applique le réajustement explicitement choisi et replanifie les créneaux futurs ; « alléger » attend l’accord (SPEC-705). |
| - | POST | /api/v1/formations/{fid}/replan-options | formations.replan-options | Calcule les trois options BR-FOR-14 d’un module bloqué sans modifier le planning (SPEC-705). |
| - | POST | /api/v1/formations/{fid}/resume | formations.resume | Reprend une formation, la replanifie depuis le jour local et applique la limite de trois (SPEC-618). |
| - | POST | /api/v1/groups/{gid}/leave | groups.leave | Quitte un groupe : copie individuelle du programme et historique privé conservé (SPEC-724). |
| - | DELETE | /api/v1/groups/{gid}/members/{uid} | groups.members.remove | Retire un membre du groupe et lui laisse une copie individuelle de son programme (SPEC-724). |
| - | POST | /api/v1/groups/{gid}/rotate-code | groups.rotateCode | Régénère le code d’invitation d’un groupe ; le précédent cesse immédiatement (SPEC-724). |
| - | GET | /api/v1/health | health.get | État de santé de l'application (base, version). |
| - | GET | /api/v1/home | home.get | Accueil de l’apprenant connecté : journée, rétention, quiz global et formations en une lecture (SPEC-603). |
| - | GET | /api/v1/invitations/{code} | invitations.get | Aperçu public minimal d’une invitation : titre de formation et capacité (SPEC-724). |
| - | POST | /api/v1/invitations/{code}/accept | invitations.accept | Rejoint une formation partagée par son code ; le programme devient commun, les données restent privées (SPEC-724). |
| - | GET | /api/v1/me | me.get | Profil du seul utilisateur connecté, y compris son étape d’onboarding (SPEC-601). |
| - | PATCH | /api/v1/me | me.update | Met à jour le prénom, le ton, la langue des cours ou le fuseau du profil (SPEC-602). |
| - | GET | /api/v1/me/ai/credentials | me.ai.credentials.list | Liste les identifiants d’IA de l’apprenant, du plus ancien au plus récent (SPEC-505). |
| - | POST | /api/v1/me/ai/credentials | me.ai.credentials.create | Enregistre une clé personnelle chiffrée auprès d’un fournisseur d’IA (SPEC-505). |
| - | DELETE | /api/v1/me/ai/credentials/{id} | me.ai.credentials.delete | Supprime une clé personnelle et les affectations de tâches qui la référencent (SPEC-505). |
| - | POST | /api/v1/me/ai/credentials/{id}/qualify | me.ai.credentials.qualify | Teste la connexion d’un modèle ou sa compatibilité non bloquante avec une tâche (SPEC-506). |
| - | POST | /api/v1/me/ai/credentials/discover | me.ai.credentials.discover | Découvre les modèles disponibles auprès d’un fournisseur à partir de ses identifiants. |
| - | GET | /api/v1/me/ai/models | me.ai.models.get | État de l’onglet Modèles d’IA : cinq tâches, modèles qualifiés et fournisseurs masqués (SPEC-709). |
| - | PATCH | /api/v1/me/ai/models | me.ai.models.update | Affecte immédiatement un modèle à une tâche ou retire le choix, sans bloquer sur la compatibilité (SPEC-709). |
| - | PUT | /api/v1/me/ai/task-models | me.ai.task-models.update | Affecte un modèle personnel à une tâche du tuteur ; la compatibilité reste non bloquante (SPEC-506/602). |
| - | GET | /api/v1/me/automation-actions | me.automation-actions.list | Journal des actions automatiques du seul utilisateur connecté, filtrable et paginé par curseur (SPEC-711). |
| - | POST | /api/v1/me/automation-actions/{id}/accept | me.automation-actions.accept | Accorde le consentement d’une action en attente du seul utilisateur connecté (SPEC-711). |
| - | POST | /api/v1/me/automation-actions/{id}/decline | me.automation-actions.decline | Refuse une action en attente du seul utilisateur connecté (SPEC-711). |
| - | POST | /api/v1/me/automation-actions/{id}/undo | me.automation-actions.undo | Annule une action appliquée du seul utilisateur connecté tant qu’elle n’est pas consommée (SPEC-711). |
| - | GET | /api/v1/me/automations | me.automations.list | Lit les dix réglages d’automatismes du seul utilisateur connecté et l’état de la pause globale (SPEC-711). |
| - | PATCH | /api/v1/me/automations | me.automations.update | Active, désactive ou reparamètre un automatisme du seul utilisateur connecté (SPEC-711). |
| - | PATCH | /api/v1/me/current-formation | formations.current | Mémorise la formation courante (dernière formation active consultée) et renvoie l’état de gestion (SPEC-618). |
| - | DELETE | /api/v1/me/deletion | me.deletion.cancel | Annule une suppression programmée (SPEC-211). |
| - | POST | /api/v1/me/deletion | me.deletion.schedule | Programme la suppression du compte à J+30 (SPEC-211). |
| - | POST | /api/v1/me/export | me.export.request | Demande un export ZIP des données personnelles (SPEC-211). |
| - | GET | /api/v1/me/exports/{id} | me.export.read | État d’un export, URL signée de dix minutes, ou redirection de téléchargement (SPEC-211). |
| - | GET | /api/v1/me/header | header.get | En-tête du seul utilisateur connecté : prénom, adresse abrégée de repli, formations actives et notifications non lues (SPEC-305). |
| - | POST | /api/v1/me/legal-acceptances | me.legal.accept | Enregistre l’acceptation des versions actives des CGU et de la confidentialité (SPEC-806). |
| - | GET | /api/v1/me/notification-settings | me.notificationSettings.get | Réglages de notifications du seul utilisateur connecté, normalisés pour l’onglet Notifications (SPEC-708). |
| - | PATCH | /api/v1/me/notification-settings | me.notificationSettings.update | Enregistre un patch partiel des réglages de notifications et retourne les réglages normalisés (SPEC-708). |
| - | GET | /api/v1/me/onboarding | me.onboarding.get | Lit l’état complet des écrans d’onboarding de l’apprenant (SPEC-1202). |
| - | PATCH | /api/v1/me/onboarding | me.onboarding.update | Avance l’onboarding sans jamais reculer et applique les rappels (SPEC-602). |
| - | DELETE | /api/v1/me/pause | me.pause.end | Met fin à la pause, propose le diagnostic de dix minutes ou replanifie immédiatement (SPEC-721). |
| - | GET | /api/v1/me/pause | me.pause.get | Lit la pause globale du seul apprenant connecté et son diagnostic de retour (SPEC-721). |
| - | POST | /api/v1/me/pause | me.pause.start | Déclare une pause globale, gèle les créneaux futurs et rend les jours neutres pour la série (SPEC-721). |
| - | POST | /api/v1/me/pause/diagnostic | me.pause.diagnostic | Enregistre le résultat réel du diagnostic de retour puis replanifie les formations reprises (SPEC-721). |
| - | GET | /api/v1/me/preferences | me.preferences.get | Lit le rythme d’étude du profil (SPEC-602). |
| - | PATCH | /api/v1/me/preferences | me.preferences.update | Enregistre le rythme d’étude : heures, jours et moments (SPEC-602). |
| - | GET | /api/v1/me/profile | me.profile.get | État de l’écran Paramètres : profil, rythme, export le plus récent et suppression programmée (SPEC-707). |
| - | PATCH | /api/v1/me/profile | me.profile.update | Enregistre le profil et le rythme en une transaction, avec la version attendue du profil (SPEC-707). |
| - | DELETE | /api/v1/me/push-subscriptions | pushSubscriptions.delete | Retire l’abonnement Web Push du navigateur courant (SPEC-205). Idempotent : une suppression répétée répond 204. |
| - | POST | /api/v1/me/push-subscriptions | pushSubscriptions.upsert | Enregistre ou rafraîchit l’abonnement Web Push du navigateur courant (SPEC-205). Idempotent sur le point de terminaison. |
| - | GET | /api/v1/me/sidebar | sidebar.get | Menu latéral du seul utilisateur connecté : formation courante, formations actives et en pause, compteurs et série (SPEC-304). |
| - | PATCH | /api/v1/me/sidebar | sidebar.update | Mémorise le masquage du menu ou la formation courante de l’utilisateur connecté, puis renvoie le menu à jour (SPEC-304). |
| - | GET | /api/v1/me/weekly-review | me.weekly-review.get | Bilan de la semaine du seul apprenant connecté : heures, rétention, notions à risque et plan de la semaine suivante (SPEC-720). |
| - | GET | /api/v1/milestones | series.milestones | Jalons réellement acquis (module validé, 100 notions, 30 jours) avec leur date et leur formation (SPEC-723). |
| - | GET | /api/v1/mock-exams/{aid} | exam.attempts.get | Renvoie la tentative d’examen, ses réponses, ses marqueurs et le temps restant serveur (SPEC-614). |
| - | PUT | /api/v1/mock-exams/{aid}/answers/{pos} | exam.answers.save | Enregistre une réponse d’examen sans révéler sa correction (SPEC-614). |
| - | PUT | /api/v1/mock-exams/{aid}/marks/{pos} | exam.questions.mark | Marque ou démarque une question « à revoir » pendant l’examen (SPEC-614). |
| - | GET | /api/v1/mock-exams/{aid}/result | exam.attempts.result | Renvoie les résultats, les lacunes des modules étudiés et la revue filtrable (SPEC-614). |
| - | POST | /api/v1/mock-exams/{aid}/submit | exam.attempts.submit | Termine l’examen, corrige toutes les réponses et calcule les scores séparés (SPEC-614). |
| - | GET | /api/v1/modules/{mid} | modules.screen | Lit un module, ses chapitres, les apports et suggestions du chapitre choisi (SPEC-607). |
| - | GET | /api/v1/modules/{mid}/course | modules.course | Lit le cours courant d’un module, chapitre par chapitre (SPEC-608). |
| - | POST | /api/v1/modules/{mid}/course-generation | modules.generateCourse | Demande la génération du cours maintenant, même si un chapitre reste ouvert (SPEC-607). |
| - | POST | /api/v1/modules/{mid}/exercises/{aid}/attempts | exercises.start | Démarre ou reprend l’unique tentative en cours d’un exercice (SPEC-613). |
| - | POST | /api/v1/modules/{mid}/exercises/{aid}/hint | exercises.hint | Révèle le prochain indice d’un exercice, plafonné à deux (SPEC-613). |
| - | POST | /api/v1/modules/{mid}/quiz/attempts | quiz.attempts.create | Crée une tentative de quiz de validation à partir de la banque, ou reprend la tentative en cours (SPEC-611). |
| - | GET | /api/v1/modules/{mid}/remediation | remediation.get | Renvoie la remédiation en cours du module, ou un statut none (SPEC-612). |
| - | POST | /api/v1/modules/{mid}/remediation | remediation.prepare | Prépare une remédiation à la demande (automatisme désactivé ou remédiation archivée) ; 409 si une remédiation est déjà prête (SPEC-612). |
| - | POST | /api/v1/modules/{mid}/remediation/complete | remediation.complete | Termine la remédiation quand toutes les questions sont vérifiées et renvoie la date de nouvelle tentative (SPEC-612). |
| - | GET | /api/v1/notifications | notifications.list | Notifications du seul utilisateur connecté, triées de la plus récente à la plus ancienne et groupées dans son fuseau (SPEC-306). |
| - | POST | /api/v1/notifications/{id}/read | notifications.read | Marque lue une notification du seul utilisateur connecté et renvoie le compteur (SPEC-306). |
| - | POST | /api/v1/notifications/read-all | notifications.readAll | Marque lues toutes les notifications du seul utilisateur connecté, sans écriture au-delà de la première (SPEC-306). |
| - | GET | /api/v1/notifications/unread-count | notifications.unreadCount | Nombre de notifications non lues du seul utilisateur connecté (SPEC-306). |
| - | GET | /api/v1/offline/pack | offline.pack | Paquet hors ligne du jour : sessions actives et cartes de rappel du lendemain (SPEC-801). |
| - | DELETE | /api/v1/resources/{rid} | resources.delete | Supprime un apport : fichier et passages retirés, citations conservées « source supprimée » (SPEC-206). |
| - | PATCH | /api/v1/resources/{rid} | resources.rename | Renomme un apport sans toucher à ses passages ni à ses citations (SPEC-607). |
| - | POST | /api/v1/resources/{rid}/dismiss | suggestions.dismiss | Ignore une suggestion du tuteur sans créer d’apport (SPEC-607). |
| - | POST | /api/v1/resources/{rid}/finalize | resources.finalize | Mesure le fichier réellement envoyé (type, octets, pages) et accepte définitivement l’apport (SPEC-206). |
| - | POST | /api/v1/resources/{rid}/import | suggestions.import | Importe une suggestion du tuteur comme apport du chapitre (SPEC-607). |
| - | POST | /api/v1/resources/{rid}/retry | resources.retry | Relance le traitement d’un apport en échec, une seule fois par tentative (SPEC-607). |
| - | GET | /api/v1/resources/{rid}/url | resources.readUrl | Renvoie une URL de lecture signée de dix minutes pour un apport fichier (SPEC-206). |
| - | POST | /api/v1/review-sessions/{sid}/answers | review.answer | Enregistre la réponse d’un jeu de la session du jour, idempotente par clientAnswerId (SPEC-701). |
| - | POST | /api/v1/review-sessions/{sid}/complete | review.complete | Clôture la session du jour et renvoie son résumé, idempotent (SPEC-701). |
| - | GET | /api/v1/search | search.global | Recherche globale dans les notions, chapitres et formations de l’apprenant : résultats groupés, extraits en texte brut et positions de surlignage (SPEC-212). |
| - | GET | /api/v1/slots/{sid}/alternatives | slots.alternatives | Trois prochains créneaux libres compatibles avec une activité future, calculés par le planificateur (SPEC-705). |
| - | POST | /api/v1/slots/{sid}/move | slots.move | Déplace une seule activité vers un créneau choisi, marque l’ancien créneau et renvoie l’agenda recalculé (SPEC-705). |
| - | GET | /api/v1/streak | series.streak | Série, 14 cases de régularité, fuseau et prochain jalon du seul apprenant connecté (SPEC-723). |
| - | POST | /api/v1/sync/offline-answers | offline.sync | Synchronise les réponses données hors ligne, idempotent par clientId (SPEC-801). |
| - | POST | /api/v1/warmups/{activityId}/answers | warmups.answers.create | Enregistre « Je savais » ou « À revoir » sur une question d’échauffement, applique FSRS et ajoute la notion au quiz global du soir (SPEC-714). |
| - | GET | /api/v1/warmups/today | warmups.today.get | Lit les échauffements du jour du seul utilisateur connecté, une entrée par formation, triés par heure de séance (SPEC-714). |
| - | POST | /api/v1/webhooks/stripe | billing.webhook | Webhook Stripe signé (en-tête Stripe-Signature, corps brut JSON), idempotent. |
