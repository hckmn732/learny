---
id: SPEC-602
title: Premiers pas (onboarding)
phase: P6
priority: V1
depends_on: [SPEC-601, SPEC-505, SPEC-506, SPEC-205, SPEC-210]
business_rules: [BR-ACC-04, BR-ACC-05, BR-ACC-06, BR-ACC-07, BR-ACC-08]
screens: [SCR-02]
adrs: [ADR-0011, ADR-0160, ADR-0161]
visual: mockup
---

# SPEC-602 — Premiers pas (onboarding)

## 1. Objectif

Livrer les cinq étapes des « Premiers pas » (`/premiers-pas/profil`, `rythme`, `ia`, `rappels`, `depart`) conformes aux étapes 3 à 7 de `design/maquettes/Inscription.dc.html`, avec persistance de chaque étape, reprise à l'étape enregistrée, choix de l'IA (clé personnelle testée et qualifiée, ou IA fournie avec paiement Stripe Checkout en fin d'inscription), réglage des rappels et des automatismes recommandés, puis le départ (créer une formation, rejoindre par invitation, découvrir l'accueil).

## 2. Contexte

L'onboarding suit la vérification de l'adresse (SPEC-601) et précède toute utilisation (BR-ACC-04). Il initialise le profil (ton, langue, fuseau), le rythme d'étude (valeur par défaut de toute nouvelle formation), les droits IA et les préférences de notification. Les écrans réutilisent la mise en page `AuthLayout` (SPEC-308) et le stepper `AuthStepper` (SPEC-601).

À lire : `design/maquettes/Inscription.dc.html` (blocs `isProfil`, `isRythme`, `isIa`, `isRappels`, `isDepart` ; script : `tons`, `tonPreview`, `hoursOpts`, `daysOpts`, `slotOpts`, `rhythmSummary`, `iaChoices`, `testKey`, `reminders`, `welcome`, `joinInvite`), `docs/product/business-rules.md` §ACC, §IA, §NOT, §AUT, `docs/architecture/data-model.md` §1 et §9, `docs/architecture/api.md`, ADR-0009, ADR-0010, ADR-0011, ADR-0030, ADR-0160.

## 3. Dépendances

- **SPEC-601** : `AuthStepper`, `ChoiceCard`/`ChoiceGroup`, messages `auth`, session ouverte au retour du lien.
- **SPEC-505** : `POST /api/v1/me/ai/credentials` (`{ provider, label, apiKey, baseUrl?, modelIds }` → `201 { id, provider, keyLast4, status: 'untested', outsideEu }`), `GET /api/v1/me/ai/credentials`, `DELETE`. Clé jamais renvoyée.
- **SPEC-506** : `POST /api/v1/me/ai/credentials/:id/qualify` → `200 { status: 'qualified'|'failed', report }` ou `202 { jobId }` (alors interroger `GET /me/ai/credentials` toutes les 3 s, ADR-0065) ; `report.failure ∈ { 'auth', 'connection', 'tools', 'structured_output', 'bricks' }` ; `PUT /api/v1/me/ai/task-models` (affectation par tâche, seulement d'un modèle qualifié) ; fixtures de test `qualified`, `auth_failed`, `invalid_bricks`.
- **SPEC-205** : helper client `subscribeToPush()` (permission + `POST /me/push-subscriptions`) ; en test, permission simulée.
- **SPEC-210** : `POST /api/v1/billing/checkout` (corps attendu `{ successPath, cancelPath }`, chemins relatifs commençant par `/`, réponse `200 { url }`), `GET /api/v1/billing/subscription` (`{ status }`), `hasManagedAi(userId)`, `STRIPE_MODE=mock` (l'URL renvoyée pointe vers une page factice qui redirige vers `successPath`).
- **SPEC-102** : `profiles` (`first_name`, `tutor_tone`, `course_language`, `timezone`, `onboarding_step`, `onboarding_completed_at`), `study_preferences`, `notification_settings`, `automation_settings`. **SPEC-202** : middleware de redirection. **SPEC-203** : émission `user/onboarding-completed`.
- **SPEC-724** (ultérieure) : `POST /api/v1/invitations/:code/accept`. SPEC-602 livre l'interface et le client de cet appel ; en attendant SPEC-724, ses tests e2e simulent la route (`page.route`) ; SPEC-724 ajoute le test réel.

## 4. Règles métier couvertes

- **BR-ACC-04** — Enchaînement Profil → Rythme → IA → Rappels → Départ ; `profiles.onboarding_step` mémorise l'étape la plus avancée atteinte et sert de point de reprise ; l'application n'est accessible qu'une fois l'étape IA franchie (le middleware redirige tant que l'étape enregistrée est `profil`, `rythme` ou `ia`).
- **BR-ACC-05** — Étape Profil : choix « Vouvoyant » (défaut, `vous`) / « Tutoyant » (`tu`) avec aperçu du texte du tuteur ; enregistré dans `profiles.tutor_tone` ; l'écran Départ applique le ton à ses phrases rédigées « par le tuteur ».
- **BR-ACC-06** — Liste « Langue des cours » : Français (défaut), English, Español, Deutsch → `profiles.course_language` ; l'interface reste en français.
- **BR-ACC-07** — Le fuseau IANA détecté par le navigateur (`Intl.DateTimeFormat().resolvedOptions().timeZone`, repli `Europe/Paris`, valeur validée contre `Intl.supportedValuesOf('timeZone')`) est enregistré à l'étape Profil.
- **BR-ACC-08** — Étape Rythme : heures par jour 1 à 6 (défaut 2), jours d'étude (défaut lundi–vendredi, au moins 1), moments (défaut soir, au moins 1) → `study_preferences` ; résumé chiffré.

## 5. Exigences fonctionnelles

- **EF-1 — Routes et reprise.** `/premiers-pas/[etape]` avec `etape ∈ { profil, rythme, ia, rappels, depart }`. Ordre : `profil < rythme < ia < rappels < depart < done`. Ouvrir une étape postérieure à l'étape enregistrée redirige vers l'étape enregistrée ; une étape antérieure est consultable et modifiable (bouton « Retour »). `/premiers-pas` redirige vers l'étape enregistrée ; si `done`, vers `/accueil`. Après connexion, un utilisateur dont l'étape n'est pas `done` arrive sur son étape enregistrée.
- **EF-2 — Coquille.** Panneau latéral identique à SPEC-601 ; compteur « Étape 3 sur 7 · Profil », « Étape 4 sur 7 · Rythme », « Étape 5 sur 7 · IA », « Étape 6 sur 7 · Rappels », « Étape 7 sur 7 · Départ » ; segments faits/courant/à venir. Bouton « Retour » sur Rythme, IA et Rappels (pas sur Profil, ni sur Départ).
- **EF-3 — Profil.** `h1` « Faisons connaissance » ; sous-titre « Le tuteur s'adressera à vous comme vous le souhaitez. ». Carte : champ « Prénom » (`autocomplete=given-name`, 1 à 60 caractères après `trim`) ; libellé « Le tuteur vous parle en » + groupe de deux boutons `aria-pressed` « Vouvoyant » / « Tutoyant » ; aperçu `aria-live="polite"` : « **Aperçu :** Bonjour <Prénom>, voici vos 3 activités du jour. On commence par un échauffement de 2 minutes ? » (vous) ou « … voici tes 3 activités du jour… » (tu) ; <Prénom> vaut « Alex » tant que le champ est vide (comme la maquette) ; liste « Langue des cours » + aide « Le tuteur rédige dans cette langue, même si vos ressources sont dans une autre. » ; bouton « Continuer ». Prénom vide à la soumission → alerte « Indiquez votre prénom. ».
- **EF-4 — Rythme.** `h1` « Votre rythme » ; sous-titre « Le tuteur s'en sert pour placer vos séances dans l'agenda. Modifiable à tout moment. ». Groupes `role="group"` : « Temps d'étude par jour » (« 1 h » … « 6 h »), « Jours d'étude » (« L », « M », « M », « J », « V », « S », « D » avec `aria-label` « Lundi » … « Dimanche »), « Moments préférés » (« Matin », « Après-midi », « Soir ») ; désélectionner le dernier jour ou le dernier moment est sans effet ; résumé : « <h> h par jour, <n> jour(s) sur 7, plutôt <moments en minuscules joints par « et »> : <h×n> h par semaine. » (ex. « 2 h par jour, 5 jours sur 7, plutôt soir : 10 h par semaine. ») ; bouton « Continuer ». Valeurs initiales = `study_preferences` existantes.
- **EF-5 — IA, choix.** `h1` « Votre IA » ; sous-titre « Le tuteur a besoin d'un modèle d'IA. Vous pourrez changer à tout moment dans les paramètres. ». `radiogroup` « Choix de l'IA » : « Ma propre clé d'IA » + pastille « Gratuit » (`#F1FBD3`/`#3D5200`) + « Vous branchez la clé d'un fournisseur (Anthropic, OpenAI, Mistral…). Learny est gratuit ; vous payez directement votre fournisseur, à l'usage. » ; « L'IA fournie par Learny » + pastille « Payant » (`#ECECFC`/`#2E2E8F`) + « Rien à configurer : le meilleur modèle pour chaque tâche, choisi pour vous. ». Défaut : clé personnelle.
- **EF-6 — IA, clé personnelle.** Carte : « Fournisseur » (options « Anthropic · Claude » `anthropic`, « OpenAI » `openai`, « Mistral » `mistral`, « Service compatible OpenAI » `openai_compatible`) ; « Clé d'API » (`type=password`, `autocomplete=off`, placeholder « Collez votre clé ») ; pour `openai_compatible` uniquement, deux champs supplémentaires « Adresse du service » (URL `https`, placeholder « https://… ») et « Nom du modèle » ; bouton « Tester la clé » ; statut `role="status"` : « Pas encore testée » (`#62626B`), « Test en cours… » (`#62626B`), « Clé valide · modèle qualifié pour Learny » (`#0B5C4D`), « Clé refusée par le fournisseur. Vérifiez-la. » (`#8F3305`, échec `auth`/`connection`), « Clé valide, mais ce modèle n'a pas réussi les tests de Learny. Essayez un autre modèle ou l'IA fournie. » (`#8F3305`, autres échecs), « Le test a pris trop de temps. Réessayez. » (après 120 s) ; note « Votre clé est chiffrée et ne sert qu'à vos propres demandes. Le test vérifie que le modèle sait produire les briques de Learny (cours, quiz, jeux). ». Modifier le fournisseur ou la clé remet le statut à « Pas encore testée ». Le modèle testé est le premier de `BYOK_RECOMMENDED_MODELS[provider]` (`packages/config/src/models.ts`) ou le « Nom du modèle » saisi ; si la liste du fournisseur est vide, le champ « Nom du modèle » s'affiche aussi pour ce fournisseur.
- **EF-7 — IA, IA fournie.** Carte : « **Abonnement mensuel, sans engagement.** Il comprend un plafond d'usage quotidien ; au-delà, le tuteur passe sur un modèle plus léger jusqu'au lendemain. » puis « Le paiement se fera à la fin de l'inscription. Vous pourrez revenir à votre propre clé à tout moment. ».
- **EF-8 — IA, « Continuer ».** Clé personnelle non qualifiée → alerte « Testez votre clé avant de continuer, ou choisissez l'IA fournie. » ; qualifiée → affectation du modèle aux 5 tâches (`programme`, `course`, `gaps`, `tutor`, `light`) puis étape `rappels`. IA fournie → suppression des affectations personnelles éventuelles (retour aux défauts) puis étape `rappels`.
- **EF-9 — Rappels.** `h1` « Rappels et automatismes » ; sous-titre « Ce qui vous fera revenir au bon moment, sans vous déranger. ». Trois lignes avec interrupteur `role="switch"` (tous activés par défaut) : « Notifications du navigateur » / « Révisions dues, quiz à venir, cours prêt. Le navigateur vous demandera l'autorisation. » ; « Programme du jour par e-mail » / « Chaque matin à 8:00, vos activités du jour. » ; « Automatismes recommandés » / « Reprise après une pause, micro-séance de secours, échauffement, révisions lissées. ». Note : « Heures calmes de 21:00 à 08:00 et 5 notifications par jour au plus. Tout se règle ensuite dans Paramètres. ». Bouton « Continuer ».
- **EF-10 — Rappels, effets.** Au clic sur « Continuer » : si « Notifications du navigateur » est activé et `Notification.permission === 'default'`, demander la permission (geste utilisateur) ; accordée → `subscribeToPush()` ; refusée ou API absente → `channel_push = false`. Puis enregistrement : `notification_settings.channel_push`, `channel_email` (= « Programme du jour par e-mail ») ; « Automatismes recommandés » → `automation_settings.enabled` des clés `reprise`, `micro_seance`, `echauffement`, `plafond_quiz` (les autres restent à leur défaut). Étape `depart`. Ensuite, si aucune clé qualifiée n'est affectée aux 5 tâches et que l'abonnement n'est pas `active`, appel `POST /billing/checkout` (`successPath: '/premiers-pas/depart?abonnement=ok'`, `cancelPath: '/premiers-pas/depart?abonnement=annule'`) et redirection vers l'URL renvoyée ; sinon navigation vers `/premiers-pas/depart`.
- **EF-11 — Départ.** `h1` « Bienvenue, <Prénom> ! » ; sous-titre « Votre compte est prêt. Par quoi voulez-vous commencer ? » (vous) ou « Ton compte est prêt. Par quoi veux-tu commencer ? » (tu). Carte sombre-lien « Créer ma première formation » / « Dites ce que vous voulez apprendre ; le tuteur pose au plus 5 questions, puis propose un programme. » → `/formations/nouvelle`. Carte blanche : libellé « Vous avez reçu une invitation ? », texte « Rejoignez une formation à plusieurs : même programme et même agenda, vos apports et vos résultats restent privés. », champ placeholder « Code ou lien d'invitation », bouton citron « Rejoindre ». Lien « Découvrir l'accueil d'abord » → `/accueil`.
- **EF-12 — Invitation.** Champ vide → `role="alert"` « Collez le code ou le lien reçu par e-mail. ». Le code est extrait par `/LRN-[A-Z2-9]{4}/i` (code seul ou lien `…/invitation/LRN-XXXX`), mis en majuscules ; non trouvé → « Ce code d'invitation n'est pas valide. ». `POST /invitations/:code/accept` : `200 { formationId, formationTitle, memberFirstNames }` → `role="status"` fond `#E1F4EF` « Invitation acceptée : « <titre> », avec <prénoms> . Ouvrir l'accueil » (prénoms des autres membres : « A », « A et B », « A, B et C ») ; `404` → « Ce code d'invitation n'existe pas ou a été régénéré. » ; `409 GROUP_FULL` → « Cette formation compte déjà 10 membres. » ; `422 FORMATION_LIMIT_REACHED` → « Vous suivez déjà 3 formations actives : mettez-en une en pause pour rejoindre celle-ci. ».
- **EF-13 — Fin de l'onboarding.** La première action de Départ (clic sur « Créer ma première formation », invitation acceptée ou « Découvrir l'accueil d'abord ») enregistre `onboarding_step = 'done'`, `onboarding_completed_at = clock.now()` et émet `user/onboarding-completed` (une seule fois).
- **EF-14 — Retour de paiement.** `?abonnement=ok` : `GET /billing/subscription` interrogé toutes les 3 s pendant 30 s au plus ; `active` → `role="status"` « Abonnement activé : le tuteur est prêt. » ; sinon « Paiement reçu, activation en cours. Vous pouvez continuer. ». `?abonnement=annule` → alerte « Le paiement n'a pas abouti : le tuteur restera indisponible tant que vous n'aurez ni abonnement ni clé d'IA. » + bouton « Reprendre le paiement » (relance EF-10 Checkout) + lien « Utiliser ma propre clé » (`/premiers-pas/ia`).

## 6. Exigences techniques

- **ET-1 — API** (ajoutées par cette spécification, déjà inventoriées dans `docs/architecture/api.md`, partagées avec SPEC-707) ; schémas dans `packages/contracts/src/me.ts` :
  - `GET /api/v1/me` → `{ id, email, firstName, lastName, tutorTone, courseLanguage, timezone, onboardingStep, onboardingCompletedAt, currentFormationId }`.
  - `PATCH /api/v1/me` ← `{ firstName?: string(1..60), lastName?: string(0..60), tutorTone?: 'vous'|'tu', courseLanguage?: 'fr'|'en'|'es'|'de', timezone?: IANA }` → profil ; `400 VALIDATION_FAILED`.
  - `GET|PATCH /api/v1/me/preferences` ← `{ hoursPerDay: 1..6, studyDays: int[1..7] non vide sans doublon, preferredSlots: ('matin'|'apres_midi'|'soir')[] non vide }` → préférences.
  - `PATCH /api/v1/me/onboarding` ← `{ step: 'rythme'|'ia'|'rappels'|'depart'|'done', reminders?: { push: boolean, email: boolean, automations: boolean } }` → `{ onboardingStep }`. Le service n'avance jamais en arrière (`max(stocké, demandé)`) ; `step: 'rappels'` exige l'étape IA satisfaite (clé qualifiée affectée aux 5 tâches **ou** choix IA fournie déclaré par `aiChoice: 'managed'` dans le même appel) sinon `422 ONBOARDING_AI_REQUIRED` ; `reminders` n'est accepté qu'avec `step: 'depart'` ; `step: 'done'` émet `user/onboarding-completed` dans la transaction (émission après commit, SPEC-203) si `onboarding_completed_at` était nul.
- **ET-2 — Service** `packages/services/src/onboarding/` : `getOnboardingState(ctx)`, `advanceOnboarding(ctx, input)`, `applyReminderChoices(ctx, reminders)` (écrit `notification_settings` et `automation_settings` directement, en transaction ; aucune dépendance aux API de SPEC-711), `onboardingNeedsCheckout(ctx): Promise<boolean>`.
- **ET-3 — Middleware** (modification de SPEC-202, ADR-0160) : redirection vers `/premiers-pas/<étape>` uniquement si `onboarding_step ∈ { profil, rythme, ia }` ; les routes `/premiers-pas/*`, `/legal/*`, `/api/*`, `/_dev/*` ne sont jamais redirigées ; l'étape est lue dans une revendication mise en cache 60 s (cookie signé `learny_ob`) invalidée à chaque `PATCH /me/onboarding`.
- **ET-4 — Pages** : `apps/web/app/(auth)/premiers-pas/[etape]/page.tsx` (Server Component : charge l'état via `getOnboardingState`, applique EF-1, rend le composant client de l'étape) ; composants `apps/web/components/onboarding/{ProfileStep,RhythmStep,AiStep,RemindersStep,DepartureStep}.tsx`, `RhythmSummary.ts` (pure), `parseInviteCode.ts` (pure), `useCredentialQualification.ts` (création, qualification, interrogation 3 s, délai 120 s).
- **ET-5 — Configuration** : `BYOK_RECOMMENDED_MODELS: Record<'anthropic'|'openai'|'mistral'|'openai_compatible', string[]>` dans `packages/config/src/models.ts` (réutilisé si SPEC-506/709 l'a créé ; sinon créé avec `anthropic: ['claude-sonnet-5-5']`, les autres lus depuis `BYOK_MODELS_OPENAI`, `BYOK_MODELS_MISTRAL` — listes séparées par des virgules, vides par défaut).
- **ET-6 — Sécurité** : la clé saisie n'est envoyée qu'à `POST /me/ai/credentials`, jamais conservée dans un état persistant du navigateur ni journalisée ; le champ est vidé après création de l'identifiant ; `baseUrl` validée `https` (sauf `http://localhost` en développement) et soumise à l'anti-SSRF de SPEC-505/506.
- **ET-7 — Accessibilité** : groupes `role="group"` étiquetés ; boutons `aria-pressed` ; interrupteurs `role="switch"` + `aria-checked` + `aria-labelledby` ; statut de test `role="status"` ; focus placé sur le `h1` à chaque changement d'étape ; navigation au clavier complète.
- **ET-8 — Idempotence** : `PATCH` idempotents par nature ; `POST /me/ai/credentials` porte un `Idempotency-Key` (UUID généré au clic) ; un second clic sur « Tester la clé » pendant un test est ignoré.

## 7. Comportements attendus et cas limites

- **CL-1 — Onboarding interrompu** à l'étape IA puis reconnexion : arrivée directe sur `/premiers-pas/ia` ; tentatives d'ouvrir `/accueil` → redirection.
- **CL-2 — Interrompu à l'étape Rappels** : l'application est accessible (`/accueil` s'ouvre) ; la connexion suivante ramène à `/premiers-pas/rappels`.
- **CL-3 — Clé refusée** (fixture `auth_failed`) : statut rouge, « Continuer » refusé avec l'alerte EF-8.
- **CL-4 — Modèle non qualifié** (fixture `invalid_bricks`) : message EF-6, l'identifiant reste enregistré (`failed`) et visible dans Paramètres ; aucune affectation.
- **CL-5 — Qualification longue** : statut « Test en cours… », bouton désactivé ; > 120 s → message de délai ; la qualification continue côté serveur et un nouveau clic relit le statut.
- **CL-6 — Paiement abandonné** : EF-14 `annule` ; l'onboarding est néanmoins `depart` (IA déclarée) ; les fonctions IA affichent ensuite `AI_UNAVAILABLE` (BR-IA-06).
- **CL-7 — Webhook Stripe en retard** : EF-14 message « activation en cours » ; aucun blocage.
- **CL-8 — Permission de notification refusée** : `channel_push = false`, passage à Départ sans message bloquant ; Paramètres permettra de réessayer.
- **CL-9 — Navigateur sans Web Push** (Safari ancien) : interrupteur laissé, effet `channel_push = false`.
- **CL-10 — Double clic sur « Continuer »** : bouton désactivé pendant la requête ; `PATCH` idempotent.
- **CL-11 — Désélection du dernier jour d'étude** : ignorée (au moins 1 jour, BR-ACC-08) ; le serveur refuse un tableau vide (400).
- **CL-12 — Fuseau non détectable** ou invalide : `Europe/Paris`.
- **CL-13 — Code d'invitation pour un groupe plein ou une 4e formation active** : messages EF-12, aucun changement.
- **CL-14 — Perte de réseau** pendant un enregistrement : alerte « Enregistrement impossible. Vérifiez votre réseau et réessayez. », saisie conservée.
- **CL-15 — Abonné déjà actif** qui choisit l'IA fournie : pas de Checkout (EF-10).

## 8. Instructions d'implémentation

1. Contrats `packages/contracts/src/me.ts` (profil, préférences, onboarding) et codes `ONBOARDING_AI_REQUIRED`, `GROUP_FULL` (si absent) dans `packages/core/src/errors.ts`.
2. Service `packages/services/src/onboarding/*` (ET-2) + tests d'intégration. Commit `feat(SPEC-602): service et API de l'onboarding`.
3. Routes `apps/web/app/api/v1/me/route.ts` (GET/PATCH), `me/preferences/route.ts`, `me/onboarding/route.ts` via `handler()`.
4. Adapter le middleware (ET-3) et ses tests. Commit `feat(SPEC-602): reprise de l'onboarding et accès après l'étape IA`.
5. Fonctions pures `RhythmSummary.ts`, `parseInviteCode.ts`, `formatFirstNames.ts` + tests.
6. Composants des cinq étapes et page `[etape]` ; textes dans `messages.onboarding` de `apps/web/messages/fr.ts`. Commit `feat(SPEC-602): écrans des premiers pas`.
7. Hook `useCredentialQualification` (SPEC-505/506), Checkout (SPEC-210), push (SPEC-205), invitation (client de SPEC-724).
8. Tests unitaires, intégration, e2e et visuel (section 12). Commit `test(SPEC-602): …`.
9. `validate.mjs SPEC-602`, preuves.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/app/(auth)/premiers-pas/[etape]/page.tsx`, `apps/web/app/(auth)/premiers-pas/page.tsx`, `apps/web/components/onboarding/*`, `apps/web/app/api/v1/me/route.ts`, `apps/web/app/api/v1/me/preferences/route.ts`, `apps/web/app/api/v1/me/onboarding/route.ts`, `packages/services/src/onboarding/*`, `packages/contracts/src/me.ts`, tests.
- **Modifiés** : `apps/web/middleware.ts` (ET-3), `apps/web/messages/fr.ts`, `packages/config/src/models.ts` (ET-5 si absent), `packages/core/src/errors.ts`.
- **Réutilisés** : `AuthLayout`, `AuthStepper`, `ChoiceCard`, `Switch`, `SegmentedControl`/boutons `aria-pressed`, `Select`, `TextField`, client API, `subscribeToPush`, services `ai-credentials` (SPEC-505/506), `billing` (SPEC-210).

## 10. Interface et conformité visuelle

- Maquette `design/maquettes/Inscription.dc.html`, états Profil, Rythme, IA (clé personnelle, défaut), IA (IA fournie), Rappels, Départ ; références SCR-02 de `design/references/manifest.json`.
- Structure : `aside` (stepper) | `main` colonne 560 px : [Retour] → `h1` + sous-titre → carte(s) → bouton « Continuer » (Rappels et IA : bouton hors carte, comme la maquette).
- `data-testid` : `onboarding-step-<etape>`, `profile-first-name`, `tone-vous`, `tone-tu`, `tone-preview`, `course-language`, `hours-<n>`, `day-<1..7>`, `slot-<matin|apres_midi|soir>`, `rhythm-summary`, `ai-choice-own`, `ai-choice-managed`, `ai-provider`, `ai-key`, `ai-base-url`, `ai-model`, `ai-test`, `ai-status`, `ai-error`, `reminder-push`, `reminder-email`, `reminder-automations`, `departure-create`, `invite-input`, `invite-join`, `invite-status`, `departure-home`, `billing-status`, `onboarding-continue`, `onboarding-back`.
- Jetons : boutons-pastilles sélectionnés `#111113`/blanc, non sélectionnés bordure `#DAD9D3` ; interrupteur actif piste `#111113` bouton `#C6F432`, inactif piste `#DAD9D3` bouton blanc ; encadré aperçu/résumé fond `#F4F4F1` rayon 14 px ; carte « Créer ma première formation » fond `#111113`, pastille `#C6F432` ; bouton « Rejoindre » `#C6F432` ; statut invitation `#E1F4EF`/`#0B5C4D`.
- Responsive : identique à SPEC-601 ; les groupes de pastilles passent à la ligne ; champs Fournisseur/Clé empilés sous 480 px.
- Contrôles : jetons, structure et textes exacts (EF-3 à EF-11), comparaison pleine page ≤ 12 % pour les six états (horloge figée 2026-11-11T12:20:00Z ; utilisateur de fabrique « Alex », valeurs par défaut), ligne de base `toHaveScreenshot`.

## 11. Critères d'acceptation

- **CA-1** — Les six états affichent exactement les textes de la section 5 ; comparaisons desktop ≤ 12 %.
- **CA-2** — Chaque « Continuer » persiste les données (contrôle en base : `tutor_tone`, `course_language`, `timezone`, `study_preferences`, `notification_settings`, `automation_settings`) et avance `onboarding_step` d'un cran, jamais en arrière.
- **CA-3** — Reprise : un utilisateur arrêté à l'étape IA est ramené à `/premiers-pas/ia` à la reconnexion et ne peut ouvrir `/accueil` ; arrêté à Rappels, `/accueil` s'ouvre.
- **CA-4** — Clé personnelle : fixture `qualified` → « Clé valide · modèle qualifié pour Learny » et 5 lignes `ai_task_models` ; `auth_failed` → message de refus et « Continuer » bloqué.
- **CA-5** — IA fournie sans abonnement : « Continuer » de Rappels redirige vers Checkout (mock) puis revient sur Départ avec « Abonnement activé : le tuteur est prêt. » ; annulation → alerte EF-14.
- **CA-6** — Résumé du rythme exact pour 3 configurations tabulées ; impossible de vider jours ou moments.
- **CA-7** — Départ : l'action choisie fixe `onboarding_step = 'done'` et émet exactement un `user/onboarding-completed` ; invitation simulée acceptée → message avec titre et prénoms.
- **CA-8** — Aucune violation axe serious/critical ; parcours complet au clavier.

## 12. Plan de tests

**Unitaires**
- `apps/web/components/onboarding/RhythmSummary.test.ts` — `describe('[SPEC-602] résumé du rythme')` : (2 h, L–V, soir) → « 2 h par jour, 5 jours sur 7, plutôt soir : 10 h par semaine. » ; (5 h, L–V, matin+après-midi) → « … plutôt matin et après-midi : 25 h par semaine. » ; (1 h, D, soir) → « 1 h par jour, 1 jour sur 7, plutôt soir : 1 h par semaine. ».
- `parseInviteCode.test.ts` — `describe('[SPEC-602] code d'invitation')` : `lrn-ab2c` → `LRN-AB2C`, lien complet, code invalide `LRN-AB1C` (1 interdit) → null.
- `formatFirstNames.test.ts`, `ProfileStep.test.tsx` (aperçu vous/tu, « Alex » par défaut), `AiStep.test.tsx` (alerte EF-8, remise à zéro du statut), `RemindersStep.test.tsx` (permission refusée → push false) — tous `describe('[SPEC-602] …')`.

**Intégration** (base réelle, IA simulée)
- `packages/services/test/integration/onboarding.test.ts` — `describe('[SPEC-602] onboarding')` : avance monotone ; `rappels` sans IA → 422 `ONBOARDING_AI_REQUIRED` ; `reminders` → colonnes attendues et 4 automatismes désactivés si `automations: false` ; `done` émet un seul événement (deux appels) ; `onboardingNeedsCheckout` vrai/faux selon clé qualifiée et abonnement mock.
- `apps/web/test/integration/me-routes.test.ts` — `describe('[SPEC-602] routes /me')` : validation Zod (heures 0 et 7 refusées, fuseau invalide refusé), RLS (un autre utilisateur ne lit pas le profil).

**End-to-end** (`apps/web/e2e/specs/p6/spec-602-onboarding.spec.ts`, vidéo)
- `test('premiers pas avec clé personnelle qualifiée @SPEC-602')` : utilisateur vérifié de fabrique → Profil (prénom, Tutoyant, aperçu, English) → Rythme (5 h, matin + après-midi, résumé) → IA (Anthropic, clé fixture `qualified`, « Tester la clé », statut vert) → Rappels (permission accordée simulée) → Départ (« Bienvenue, Alex ! », phrase au tutoiement) → « Créer ma première formation » → `/formations/nouvelle`.
- `test('premiers pas avec IA fournie et paiement @SPEC-602')` : IA fournie → Rappels → Checkout mock → Départ « Abonnement activé… » ; second parcours avec annulation → alerte et « Reprendre le paiement ».
- `test('reprise de l'onboarding et clé refusée @SPEC-602')` : fixture `auth_failed` → alerte ; quitter, se reconnecter → `/premiers-pas/ia` ; `/accueil` redirigé.
- `test('rejoindre par invitation @SPEC-602')` : route `/api/v1/invitations/*/accept` simulée (200, 404, 409) → messages EF-12.
- axe sur chaque étape.
- **Visuel** : `test('conformité SCR-02 premiers pas @SPEC-602 @visual')` : jetons, structure, comparaison pleine page des six états ≤ 12 %, `toHaveScreenshot` desktop et mobile.
- **Non-régression** : `@SPEC-601`, `@SPEC-202`, `@SPEC-505`, `@SPEC-506`, `@SPEC-205`, `@SPEC-210`.

| Critère | Tests |
|---|---|
| CA-1 | visuel `@SPEC-602 @visual`, `ProfileStep.test.tsx` |
| CA-2 | intégration `onboarding.test.ts`, e2e clé personnelle |
| CA-3 | e2e « reprise… », intégration middleware |
| CA-4 | e2e clé personnelle et « reprise… clé refusée », `AiStep.test.tsx` |
| CA-5 | e2e « IA fournie et paiement » |
| CA-6 | `RhythmSummary.test.ts`, `me-routes.test.ts` |
| CA-7 | intégration `done`, e2e invitation |
| CA-8 | axe dans tous les e2e |

## 13. Preuves attendues

`evidence/SPEC-602/` : vidéos des 4 parcours ; captures `profil.png`, `rythme.png`, `ia-cle.png`, `ia-cle-qualifiee.png`, `ia-fournie.png`, `rappels.png`, `depart.png`, `depart-abonnement-annule.png`, versions mobiles ; comparaisons visuelles des six états ; extrait des lignes en base après le parcours (JSON anonymisé).

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; en plus : middleware conforme à ADR-0160 avec tests ; aucun secret ni clé dans les journaux (test de non-fuite de SPEC-010 rejoué) ; textes dans `apps/web/messages/fr.ts`.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0009, ADR-0010, ADR-0011, ADR-0012 (texte du plafond), ADR-0030, ADR-0055, ADR-0061, ADR-0064, ADR-0065.
- **ADR-0160** (créé) : accès à l'application dès l'étape IA franchie, reprise sur l'étape la plus avancée, Checkout lancé à la fin de l'étape Rappels, correspondance des trois interrupteurs de Rappels avec les colonnes de préférences, modèle testé par défaut, fin d'onboarding à la première action de Départ.
- **ADR-0161** (créé) : comparaison visuelle (pleine page ici).
- Textes ajoutés (absents de la maquette) : statuts « Test en cours… », non-qualification, délai, champs « Adresse du service » / « Nom du modèle », messages d'invitation d'erreur, retour de paiement, « Indiquez votre prénom. ».
- Hypothèses inter-spécifications (signalées au rapport) : contrats SPEC-505/506/210 de la section 3 ; route d'acceptation d'invitation livrée par SPEC-724 avec la réponse `{ formationId, formationTitle, memberFirstNames }`.
