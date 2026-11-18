# Learny — Bugs QA du 2026-11-18 : analyse vérifiée et plan de correction

**Périmètre** : les 13 bugs signalés sur la pile QA (`https://qa.129.146.180.162.sslip.io`), formés « analyse, vérification, plan d'implémentation » — sans investigation de cause côté testeur au moment du signalement.

**Méthode** : chaque bug a été **revérifié sur la pile QA réelle** (commit déployé `6c882b20`, branche `main` ; 6 commits d'écart avec le HEAD local `773a4859`, tous des corrections e2e — `git diff 6c882b20..HEAD` sur les fichiers concernés est vide) :
- session authentifiée réelle « Alex Perrin » créée via le flux officiel (lien magique → Mailpit → callback), requêtes rejouées sur l'API et les pages ;
- inspection directe de la base Postgres de la pile (conteneur `db-*`) et des logs `web`/`worker`/Inngest ;
- lecture du code ancrée fichier:ligne (4 investigations en parallèle, rapports intégrés ci-dessous).

Compte de démo : `alex.perrin@demo.learny.test` = `3b69c7a7-b1f5-597a-b199-999de11ffdfd`. Formation « SAP S/4HANA Finance » : **résoudre par titre** (cf. constat transverse CT‑1).

---

## 1. Résumé exécutif

| # | Bug | Statut vérifié sur la pile | Cause racine (vérifiée) |
|---|-----|------------------------------|--------------------------|
| 1 | Accueil : 3 blocs « Impossible de charger… » (RATE_LIMITED) | **Corrigé en apparence** — home 200 en direct, `rate_limits` vide, aucun 429 dans les logs | Horloge figée ⇒ les seaux du limiteur ne se rechargent **jamais** (`now − updated_at = 0`) ; le service `rate-limit-reset` purge toutes les 300 s = mitigation, pas un correctif |
| 2 | Accueil : colonne droite trop courte, grand vide | **Reproduit** (structure) | `GlobalQuizCard` n'a pas la croissance `flex: 1 1 auto` de la maquette SCR‑03 ([home-view.tsx:253](apps/web/components/home/home-view.tsx#L253)) |
| 3 | Bilan : « Non disponible » déborde de sa tuile | **Reproduit** (code + données) | `dd` de tuile sans `min-w-0`/`break-words` — « disponible » en Space Grotesk 22 px ≈ 110‑120 px > 71 px de boîte ([WeeklyReviewCard.tsx:119-122](apps/web/components/home/WeeklyReviewCard.tsx#L119-L122)) |
| 4 | Échauffement : grand vide en état « Terminé » | **Reproduit** (code) | `items-stretch` + `flex-1` inconditionnel étire la carte ([WarmupCard.tsx:125](apps/web/components/home/WarmupCard.tsx#L125)) |
| 5 | Quiz de validation module 3 : « ne se charge pas » | **Reproduit en direct** : `POST /modules/{mid}/quiz/attempts` → **422 RETRY_NOT_YET_ALLOWED**, « Nouvelle tentative possible mercredi 11 nov., 16:30 » | L'action seedée `remediation_ready` porte `retryAvailableAt = 13:00Z` (14:00 Paris) alors que l'horloge QA est figée à **12:20Z** — 40 min plus tôt, pour toujours. La page affiche une erreur de chargement générique + « Tentative 1 » par repli |
| 6 | Fil d'Ariane « moche », à homogénéiser | **Reproduit** — 9 implémentations artisanales `<a underline>` | Le composant canonique `Breadcrumb` (packages/ui) existe et n'est utilisé **nulle part** en production |
| 7 | « Le tuteur propose » → Accepter échoue | **Reproduit en direct** : 404 **« Séance manquée introuvable »** | Le payload seedé référence `missedSlotId`/`bufferSlotId` (`slot/m0`, `slot/m0-buffer`) **jamais insérés par la seed** (ADR‑0322 : le slot était créé par le test e2e, pas par la seed) |
| 8 | « Autre créneau » échoue aussi | **Même cause que #7** (verrou du slot manqué avant le choix) + 2ᵉ couche : créneaux proposés chevauchant des slots seedés (`j2`, `v3`) | idem #7 |
| 9 | Pastilles sans curseur main | **Reproduit** (code) | `<button>` natifs sans `cursor-pointer` ([TutorProposalBanner.tsx:323,337,361-364](apps/web/components/home/TutorProposalBanner.tsx#L323)) — la maquette l'avait |
| 10 | Génération du cours : aucun statut/progression | **Reproduit** (code + worker) — bandeau = toast local statique ; en plus, la génération **échoue réellement** en QA : worker `course_generation → AI_UNAVAILABLE` ×4 | (a) `courses.status='generating'` n'est **jamais écrit** en production, le DTO module n'a pas de champ génération, le bandeau est un état React éphémère ; (b) entitlement IA absent de la seed (CT‑2) |
| 11 | « Demander au tuteur » → bulle flottante (évolution) | Constaté (code) ; évolution hors périmètre V1 actuel (BR‑TUT‑01) | — (plan dédié, §5 vague 3) |
| 12 | Panneau « Tuteur » fixe qui perturbe la page | **Reproduit** (code) + **envoi de message KO en direct** : `conversations.messages` → 422 **AI_UNAVAILABLE** (`no_subscription_no_key`) | Panneau `fixed` codé en dur (z‑dialog > z‑header ⇒ cloche coupée), carte jamais masquée, starters/follow‑ups non dédupliqués, EF‑15 (reprise < 24 h) non implémentée ; **et** l'IA est indisponible en QA (CT‑2) |
| 13 | Quiz global micro « Rien à revoir » vs « Quiz global 14 » | **Reproduit en direct** (page 200 + « Toutes vos notions sont à jour ») | La session **complète** du jour a déjà été jouée sur la pile (tentative graded 40 %) : les 5 briques de révision seedées sont toutes « empreinte vue » ⇒ le composeur micro ne peut rien servir ⇒ DTO `empty` avec un message trompeur ; la seed réinitialise `notion_states` (badge 14) mais **pas** les activités/tentatives/réponses créées par l'application |

---

## 2. Constats transverses (racines communes, vérifiés sur la pile)

### CT‑1 — L'UUID de formation du signalement contient un homoglyphe
Le literal de l'URL dans le signalement ne correspond pas octet pour octet à l'identifiant en base (md5 ≠), tout en s'affichant à l'identique : mes requêtes SQL et mes curls copiant cet UUID renvoyaient 404/0 ligne, alors que le même appel avec l'UUID tiré de la base fonctionne. **Règle** : dans les specs, les tests et les correctifs, résoudre les identifiants par titre ou par la seed (`demoId(…)`), jamais par copier‑coller d'un UUID provenant d'un texte.

### CT‑2 — La seed de démo ne donne AUCUN accès IA à la pile QA (cause racine de #10, #12, et de l'impossibilité de récupération de #13/#5)
- En base : `subscriptions` d'Alex = `status 'none'`, `current_period_end NULL` ; `ai_credentials` : **0 ligne** ; `ai_task_models` : **0 ligne**.
- Or `resolveModel` ([packages/llm/src/resolve.ts:80-136](packages/llm/src/resolve.ts#L80)) exige un modèle personnel qualifié **ou** un abonnement actif (`hasManagedAi` : `status='active'` et `current_period_end > clock.now()`), **avant même** de choisir le modèle mock (`session.ts:210-218`).
- Résultat : toute tâche IA répond `AI_UNAVAILABLE / no_subscription_no_key`, y compris en `LLM_MODE=mock` :
  - reproduit en direct : `POST /api/v1/conversations/{id}/messages` (corps valide) → 422 `AI_UNAVAILABLE` ;
  - worker : `course_generation` → `AI_UNAVAILABLE`, 4 tentatives épuisées ;
  - `question_bank_jobs` : job `exhaustion` créé pendant la QA, **0 question insérée** — la régénération de variantes ne peut jamais aboutir.
- Les specs e2e qui exercent l'IA **s'auto-provisionnent** (`insert into public.subscriptions … values ('active', '2030-01-01')` — 15+ fichiers) ; la seed SPEC‑115 ne le fait pas ⇒ la pile QA n'a jamais eu d'IA fonctionnelle. La doc de la pile promet pourtant « IA simulée : réponses déterministes des fixtures ».
- **Correctif** : la seed de démo doit upserter un abonnement actif pour les comptes de démo (`status='active'`, `current_period_end` futur **au‑delà de l'horloge figée**, plafond journalier confortable), sans quoi « IA fournie » et « clé personnelle » restent des impasses en recette. C'est le débloquant unique de la génération de cours, du chat, de la banque de questions.

### CT‑3 — Horloge figée + limiteur ⇒ recharge nulle (fond du #1)
`CLOCK_FIXED_AT=2026-11-11T12:20:00Z` ⇒ chaque consommation calcule `now − updated_at = 0` ⇒ le seau (`user:<uuid>:default`, capacité 120, +2 jetons/s en temps normal) **ne se recharge jamais** et se vide définitivement après 120 requêtes (l'accueil en consomme ≈ 8 par montage + polling ; toutes les routes `default` partagent le même seau). Le service docker `rate-limit-reset` (purge 300 s) traite le symptôme : fenêtres de blocage jusqu'à 5 min, `Retry-After: 1 s` mensonger, et panneaux UI qui affichent « Vérifiez votre connexion » pour un 429. Tests d'intégration existants : `packages/services/test/integration/rate-limit.test.ts:55-69`.

### CT‑4 — La seed ne réinitialise pas l'état dérivé créé par l'application (fond du #13)
La seed est idempotente sur des ids fixes et **upsert** `notion_states` (états FSRS, due counts — le badge « Quiz global 14 » repasse à 14 à chaque redéploiement) mais ne supprime **jamais** les lignes créées à l'exécution (`activities`, `attempts`, `answers`, empreintes vues). Dès qu'un testeur joue une session, la pile reste « dérivée » pour toujours : les e2e contournent cela avec `restoreDemoSession()` ([micro-session.spec.ts:100-151](apps/web/e2e/specs/p7/micro-session.spec.ts#L100-L151)) ; la pile QA n'a pas d'équivalent. Le commit récent « seed tolérante » (e0f02d5c) tolère la dérive au lieu de la réparer.

---

## 3. Fiches détaillées (constat vérifié + cause + correctif)

### #1 — Accueil : 3 blocs en erreur « Impossible de charger… » — Majeur → corrigé en apparence
- **Vérification live (post‑correctif)** : `GET /api/v1/home` → 200 ; page `/accueil` 200 sans état d'erreur ; `rate_limits` vide ; aucun `RATE_LIMITED` dans les logs du déploiement courant. Le correctif déployé (SPEC‑208 + service de purge + seed tolérante) supprime bien le symptôme immédiat.
- **Mécanique** : CT‑3 ci‑dessus. Les trois panneaux (échauffement `warmups/today`, actions tuteur `me/automation-actions` ×4, bilan `me/weekly-review`) mappent **tout échec** sur « Vérifiez votre connexion puis réessayez. » sans distinction de code ([ErrorState](packages/ui/src/components/ErrorState/ErrorState.tsx#L23), panneaux [WarmupCard.tsx:287-297](apps/web/components/home/WarmupCard.tsx#L287-L297), [TutorActivityCard.tsx:164-171](apps/web/components/home/TutorActivityCard.tsx#L164-L171), [WeeklyReviewCard.tsx:53-72](apps/web/components/home/WeeklyReviewCard.tsx#L53-L72)).
- **Correctif recommandé** : (a) QA seulement — `RATE_LIMIT_MODE=off` branché sur le `noopRateLimiter` existant ([bootstrap-security.ts:23-37](apps/web/lib/api/bootstrap-security.ts#L23)) avec garde `APP_ENV=local`, puis retrait du conteneur de purge ; ou à défaut purge à 60 s ; (b) produit — mapper le code d'erreur dans la description des panneaux (429 → « Trop de requêtes… », 401 → session expirée) via un helper `errorDescriptionOf`.
- **Tests** : (i) horloge figée + 121 requêtes ⇒ refus persistant (caractérise la non‑recharge) ; (ii) mode off ⇒ 200 au‑delà de 120 ; (iii) mapping UI 429/401 ; (iv) verrouiller la présence du purgeur **uniquement** dans la pile QA.
- **Interdits** : ne pas brancher le limiteur sur l'horloge système (ADR‑0047/ADR‑0258) ; ne jamais recopier `rate-limit-reset` dans la pile de production.

### #2 — Accueil : espace vide sous la colonne droite — Cosmétique→mineur
- **Vérification** : structure confirmée dans le code ; le bloc « Bilan de la semaine » n'est **pas absent** : il vit en 2ᵉ position de la colonne droite de la **rangée 2** (sous « Le tuteur a agi pour vous »), conforme à la maquette — sur la capture il était simplement **sous le pli**.
- **Cause** : la maquette donne `flex: 1 1 auto` à la carte lime « Quiz global » ([Main.dc.html:176](design/maquettes/Main.dc.html#L176)) — mécanisme d'équilibrage absent de l'implémentation ([home-view.tsx:253](apps/web/components/home/home-view.tsx#L253) n'a pas `grow`) ; plafond `max-w-[353px]` non prévu par la maquette.
- **Correctif** : `className="flex grow flex-col …"` sur `GlobalQuizCard` (+ option : retirer/ajuster `max-w-[353px]` pour revenir à la répartition `2 1 520px / 1 1 300px`). Ne pas déplacer le bilan.
- **Tests** : régénérer `spec-603-accueil-desktop/mobile` + baselines responsive 360/390/768 ; nouveau test géométrique « bas de `home-global-quiz` ≈ bas de `home-day` (±24 px) ».

### #3 — Bilan : « Non disponible » déborde de sa tuile — Mineur
- **Vérification** : la valeur vient de `weeklyRetentionLabel(null)` = « Non disponible » ([automatisme-9-bilan-de-la-semaine.ts:247-249](packages/contracts/src/automatisme-9-bilan-de-la-semaine.ts#L247)) — état légitime (formation de 9 jours ⇒ pas de mesure « retenue à 1 mois » ; le payload du bilan de la seed est un fixture dérivé au rendu). Le bug est purement CSS : tuile `grid-cols-3` ≈ 71 px de boîte de contenu, « disponible » (Space Grotesk 22 px semibold) ≈ 110‑120 px, aucun `min-w-0`/`break-words`/`truncate`.
- **Correctif** : `min-w-0 break-words [overflow-wrap:anywhere]` sur les trois `dd` de tuiles ([WeeklyReviewCard.tsx:111-130](apps/web/components/home/WeeklyReviewCard.tsx#L111-L130)) ; **règle générique demandée par l'utilisateur** : composant `StatTile` (packages/ui) imposant la garde sur valeur et libellé — emplacements à risque recensés : pills « notions à risque » (l. 160‑168), ligne période (l. 102‑104), question d'échauffement ([WarmupCard.tsx:186-191](apps/web/components/home/WarmupCard.tsx#L186-L191)), ligne notion du quiz global, résumés tuteur, `StatCard` du design system (aucune garde aujourd'hui).
- **Tests** : e2e « mesure absente » avec `rate: null` + assertion `scrollWidth ≤ clientWidth` ; régénérer `spec-720-bilan-desktop/mobile`. Préférer le correctif CSS/composant (aucun ripple contractuel).

### #4 — Échauffement : grand vide en état « Terminé » — Cosmétique
- **Cause** : rangée `items-stretch` + carte `flex-1` inconditionnel ([WarmupCard.tsx:125](apps/web/components/home/WarmupCard.tsx#L125)) ; en état « Terminé » le contenu fait ~230 px dans une colonne de ~500 px.
- **Correctif** : croissance conditionnelle à l'état actif — `done ? 'self-start' : 'flex-1'` ; l'invariant métier (« répondre ne déplace jamais la carte tuteur », [home-view.tsx:758-760](apps/web/components/home/home-view.tsx#L758-L760)) est préservé (la hauteur de rangée reste portée par la colonne droite).
- **Tests** : régénérer `accueil-echauffement-fin-desktop-linux.png` + pages accueil ; assertions géométriques « hauteur carte − hauteur contenu < ~220 px » et « position Y de la carte tuteur inchangée après réponse ».

### #5 — Quiz de validation module 3 « ne se charge pas » — Bloquant (provisoire) → **cause exacte trouvée**
- **Vérification live** : la page SSR s'affiche (200, « Seuil 80 % », « Tentative 1 ») ; la création de tentative échoue : `POST /api/v1/modules/{mid}/quiz/attempts` → **422 `RETRY_NOT_YET_ALLOWED`**, « Nouvelle tentative possible mercredi 11 nov., 16:30. » (`reason: 'delay'`, `availableAt: 2026-11-11T15:30:00Z`).
- **Mécanique** : tentative 1 ratée à 58 % (10 nov. 15:30Z) ; l'action seedée `remediation_ready` porte `payload.retryAvailableAt = '2026-11-11T13:00:00.000Z'` (14:00 Paris, cohérente avec le créneau d'agenda « Tentative 2 · seuil 80 % » à 14:00) — mais l'horloge QA est figée à **13:20 Paris**, soit 40 min **avant**, pour toujours ⇒ le quiz est inpassable sur la pile, tandis que l'accueil et l'agenda y invitent en bouton principal. L'é2e `remediation.spec.ts:186-201` prouve que cet état de délai est **volontaire au produit** (écran résultat = bouton désactivé + date) ; le bug est que **la page quiz** l'affiche comme une erreur de chargement générique, avec une pastille « Tentative 1 » par repli (`attempt?.attemptNo ?? 1`, [QuizScreen.tsx:138](apps/web/components/quiz/QuizScreen.tsx#L138)) alors que l'agenda dit « Tentative 2 » (méta statique du créneau seedé).
- **Complément** : la seed ne crée **aucune** brique `purpose='bank'` ⇒ même après le délai, le premier tirage passerait par `preparing` (job question‑bank mock — fonctionnel une fois CT‑2 corrigé).
- **Correctif** :
  1. UX (produit) : état dédié `RETRY_NOT_YET_ALLOWED` sur la page quiz (« Nouvelle tentative possible <date> », lien remédiation, parité avec l'écran résultat) — [use-quiz-attempt.ts](apps/web/components/quiz/use-quiz-attempt.ts) expose `code`/`availableAt`, [QuizScreen.tsx](apps/web/components/quiz/QuizScreen.tsx), [messages/fr/quiz.ts](apps/web/messages/fr/quiz.ts) ;
  2. pastille d'en‑tête : numéro de la **prochaine** tentative (`nextAttemptNo`, [start.ts:259-269](packages/services/src/quiz/start.ts#L259)) ou pastille masquée tant qu'aucune tentative n'est chargée ;
  3. contrat : ajouter `RETRY_NOT_YET_ALLOWED` à `ATTEMPT_ERRORS` ([attempts.ts:245-253](packages/contracts/src/attempts.ts#L245)) + OpenAPI ;
  4. QA (déblocage recette) : dans la seed, avancer `retryAvailableAt` de l'action démo à un instant **≤ 12:20Z** (ex. 11:00Z) pour rendre le quiz jouable — l'e2e du délai rejoue sa propre automation, ses assertions « 13:00Z » sont à resynchroniser.
- **Tests** : e2e « visiter /quiz du module 3 sur le jeu démo → état délai + pastille Tentative 2 » ; unitaire mapping 422 ; intégration `retryAvailableAt` atteint ⇒ 201/`preparing` ; test de contrat.

### #6 — Fil d'Ariane à homogénéiser — Cosmétique (à passer mineur : 9 écrans)
- **Constat** : le composant canonique existe — [`Breadcrumb`](packages/ui/src/components/Breadcrumb/Breadcrumb.tsx#L25) (liens indigo non soulignés, séparateur `aria-hidden`, page courante non cliquable avec `aria-current`, troncature 40 car.) + builder `buildFormationBreadcrumb` — utilisé **uniquement dans la galerie dev**. Neuf implémentations artisanales `<a underline>` : QuizHeader, CourseScreen, ModuleScreen, QuizResultScreen, RemediationScreen, ExamIntro, ExamResults, ExerciseWorkspace (3ᵉ style distinct), ProposalHeader (hybride, hors motif).
- **Correctif** : remplacer les 8 fils de situation par `<Breadcrumb items={buildFormationBreadcrumb(...)} />` (exclure `ProposalHeader` du motif) ; normaliser l'apostrophe « Fil d'Ariane » (droit) ; ne pas toucher au style global des `<a>` bruts restants.
- **Tests** : snapshot ARIA `quiz-question` + 7 baselines pixel à régénérer (liste exacte dans le rapport UI) ; nouveau test partagé « 9 écrans ⇒ nav aria-label, items−1 liens, aria‑current, pas de soulignement ».

### #7 / #8 — « Le tuteur propose » : Accepter et Autre créneau échouent — Majeur (confirmés, cause exacte)
- **Vérification live** : `POST /api/v1/me/automation-actions/{id}/accept` (corps `{}`, Origin correct, clé d'idempotence) → **404 `NOT_FOUND` « Séance manquée introuvable. »** ; l'action retombe `pending_consent` (rollback complet), le bandeau reste.
- **Cause racine (données seed)** : le fixture `reschedule` référence `payload.missedSlotId = demoId('slot','m0')` et `proposed.bufferSlotId = demoId('slot','m0-buffer')` ([demo-fixtures.ts:1607-1645](packages/db/src/seed/demo-fixtures.ts#L1607)) — **aucun de ces slots n'est inséré par la seed** (vérifié en base : 0 ligne pour les deux id). ADR‑0322 (décision 5) documente que le slot manqué « est créé par le test e2e » — or la pile QA n'exécute pas les e2e. L'effet `applyReplacement` verrouille d'abord le slot manqué ([reprise.ts:923-924](packages/automations/src/definitions/reprise.ts#L923)) ⇒ NOT_FOUND ⇒ rollback ⇒ toast générique (le mapping client n'a de messages dédiés que pour `CONFLICT` et `AUTOMATION_ACTION_EXPIRED`, [use-tutor-proposals.ts:119-124](apps/web/components/home/use-tutor-proposals.ts#L119)).
- **2ᵉ couche (à corriger en même temps)** : une fois `m0` créé, la proposition principale chevauche le slot seedé `j2` (« Ledgers parallèles » jeudi 10:30‑12:00, [demo-fixtures.ts:1298-1310](packages/db/src/seed/demo-fixtures.ts#L1298)) et l'alternative « Vendredi 15:00 » chevauche la marge `v3` ([demo-fixtures.ts:1363-1375](packages/db/src/seed/demo-fixtures.ts#L1363)) ⇒ le flux passerait de 404 à 409 « Ce créneau n'est plus libre » (documenté dans l'e2e `reprise.spec.ts:46-51`).
- **3ᵉ anomalie connexe** : le fixture n'a **pas de `payload.expiresAt`** ⇒ la proposition ne peut jamais expirer sur la pile (bandeau inextinguible, même des semaines après).
- **Correctif** :
  1. seed : insérer le slot manqué `m0` (mardi, statut `missed`, hors semaine visible comme le fait l'e2e) et la marge `m0-buffer` ; rendre les créneaux proposés réellement libres (retirer/ajuster `j2` — l'état « proposition en attente » ne doit pas déjà contenir son propre résultat — et libérer `v3` ou déplacer l'alternative) ; ajouter `expiresAt` au fixture ; consigner la décision (ADR successeur d'ADR‑0322 décision 5) ;
  2. observabilité client : messages distincts dans `proposalErrorMessage` (429, 4xx non prévu) ;
  3. (facultatif) code d'erreur dédié pour « cible de l'action absente » côté serveur.
- **Tests** : intégration « slot référencé absent ⇒ NOT_FOUND et statut préservé (rollback) » ; **test d'intégrité du seed** (le payload référence des slots existants ; les créneaux proposés ne chevauchent rien de `planned`) ; e2e de régression **sans** `restoreSeed` : Accepter ⇒ « Séance replacée » + slot créé `moved_from_id = m0` ; pastille ⇒ idem. Comptes SPEC‑115 (`agendaSlots`) et e2e `spec-115.spec.ts:106` (« 23 créneaux ») à resynchroniser ; captations visuelles agenda/accueil à rejouer.
- **À ne pas faire** : affaiblir le garde‑fou `lockSlot`/`assertFree` (le contrôle est légitime ; la donnée est fautive) ; modifier l'ordre verrou‑origine‑avant‑choix (ADR‑0180, trigger SQL de cohérence).

### #9 — Pastilles sans curseur main — Cosmétique
- Vrais `<button>` natifs sans `cursor-pointer` ([TutorProposalBanner.tsx:323, 337, 361-364](apps/web/components/home/TutorProposalBanner.tsx#L323)) ; la maquette ([Main.dc.html:123](design/maquettes/Main.dc.html#L123)) et le design system (`Button.tsx:13`) l'avaient ; la cible tactile 44 px est déjà couverte par pseudo‑élément CSS.
- **Correctif** : ajouter `cursor-pointer` (+ `transition-colors`, `hover:`, `disabled:cursor-not-allowed` pour cohérence design system) aux trois groupes de boutons natifs du composant ; test unitaire `toHaveClass('cursor-pointer')`.
- **Anomalies de libellés connexes** (documentées, décision produit) : « Jeudi 12 nov., 15:00 » avec date vs « Lundi 9:00 » sans date — le bandeau utilise l'horloge **réelle du navigateur** comme référence ([TutorProposalBanner.tsx:379-381](apps/web/components/home/TutorProposalBanner.tsx#L379)), alors que le serveur utilise `action.createdAt` : prendre `createdAt` comme référence rend les libellés stables ; « 9:00 » sans zéro initial est **intentionnel** (format de la maquette) ; « 12 nov. » vs « 12 novembre » = écart de style inter‑écrans à trancher en ADR si on l'unifie.

### #10 — Génération du cours : aucun statut ni progression — Majeur (deux couches)
- **Vérification** : le bandeau « Génération du cours demandée. » est un **toast local** ([ModuleScreen.tsx:222-234, 402-404](apps/web/components/module/ModuleScreen.tsx#L222)) — aucun lien avec un état persistant. Surtout : **aucune ligne `courses` n'existe pendant la génération** — l'enum `generating` (défaut du schéma) n'est **jamais écrit en production** (les seuls INSERT écrivent `ready`/`failed`, [generate.ts:613, 736](packages/tutor/src/course/generate.ts#L613)) ⇒ le DTO `generation.status` reste `none`, le polling déjà implémenté côté cours ([CourseScreen.tsx:36-39](apps/web/components/course/CourseScreen.tsx#L36), 3 s, ADR‑0065) ne se déclenche jamais ; le DTO `ModuleScreen` n'a **aucun** champ génération.
- **Piège supplémentaire** : la clé d'événement `course-generation:<mid>:force:<chapters:count>` est **identique après un échec** ⇒ un clic « relancer » est dédupliqué par Inngest pendant 24 h et ne relance rien.
- **Et en pile QA, la génération échoue réellement** : worker `AI_UNAVAILABLE` ×4 (CT‑2) — le bandeau statique masque un échec permanent.
- **Correctif (plan complet dans le rapport #10)** :
  - A. persister une ligne `courses` en attente (`status='generating'`, `is_current=false`, `generation_key=<clé+compteur d'échecs>`) au moment de la demande (transaction + outbox), convertie en `ready`/`failed` par le pipeline ; inverser la priorité `generating` dans la dérivation ([get-course.ts:289-300](packages/services/src/courses/get-course.ts#L289)) ;
  - B. exposer `courseGeneration` dans le contrat `ModuleScreen` + `getModuleScreen` (réutiliser `GET /modules/:mid`, déjà pollé) ;
  - C. bandeau dynamique `CourseGenerationNotice` (en cours / prêt + lien / échec + « Relancer » réel grâce à la clé variée), `refetchInterval` 3 s pendant `generating` ;
  - D. (incrément possible, pas V1) : progression fine par steps Inngest par chapitre.
- **Tests** : unit (insert atomique, idempotence, conversion `generating`→`ready`/`failed`), int (DTO module pendant job inline), e2e `course-generation.spec.ts` revu (bandeau « rédige votre cours » → « prêt » → lien cours), visuel (état `generating`).

### #11 — « Demander au tuteur » en bulle flottante contextuelle — Évolution (plan dédié)
Constat de cadrage : **BR‑TUT‑01 lie la discussion au cours en V1** (`tutor_conversations.course_id NOT NULL`) — une bulle sur toutes les pages est une évolution hors périmètre actuel : elle exige **ADR + mise à jour des business rules + spécification** avant implémentation (priorité ADR > business rules > spec du dépôt). La référence `deepseek-ai/chat-demo` n'impose aucune dépendance — seul le modèle d'interaction est à retenir (point d'entrée discret, streaming, mobile) ; toutes les briques existent déjà (SSE, historique, follow‑ups, conventions mobile SPEC‑802).
- **Découpage livrable** (détail dans le rapport #11) : 1) `TutorPanel` migré sur `ResponsivePanel` (corrige #12 au passage) ; 2) `TutorBubble` (FAB 56 px, `z-drawer`) + `TutorPageContext` (dérivation route → contexte) montés dans `AppShell`, carte SCR‑07 réduite en point d'entrée, suppression du décalage `xl:pr-[500px]` ; 3) gouvernance (ADR + BR‑TUT‑01/07 + spec) ; 4) conversation générique (migration `course_id` nullable + `scope`, `POST/GET /api/v1/conversations`) ; 5) contextes par page ; 6) tests complets (unit, int, e2e vidéo, visuel, axe).
- Performance : bundle chat en `next/dynamic`, état ouvert local au composant (pas de re‑render global) ; hors‑ligne : message d'indisponibilité (le chat n'est pas dans le pack hors‑ligne).

### #12 — Panneau « Tuteur » fixe qui perturbe la page — Mineur (confirmé + aggravé par CT‑2)
- **Constat code** : panneau `fixed top-0 right-0 bottom-0 z-dialog (50)` codé en dur ([TutorPanel.tsx:270](apps/web/components/tutor-chat/TutorPanel.tsx#L270)) — l'en‑tête (z 30) est recouvert sur 460 px, cloche comprise ; `body.overflow` manuel ; pas de voile ni piège de focus ; la carte « Demander au tuteur » **reste affichée** à côté (décalage `xl:pr-[500px]` du contenu seulement) ; un clic sur une suggestion affiche donc le même texte **deux fois** (bouton dans la carte + bulle apprenant) ; starters ([starters.ts:63-95](packages/services/src/tutor-chat/starters.ts#L63)) et follow‑ups ([follow-ups.ts:35-45](packages/services/src/tutor-chat/follow-ups.ts#L35)) construits indépendamment ; EF‑15 (reprise de la dernière discussion < 24 h) **non implémentée** — chaque ouverture crée une conversation (d'où l'accumulation observée en QA).
- **Vérification live** : envoi de message → 422 `AI_UNAVAILABLE` (CT‑2) : en pile QA le tuteur **ne peut pas répondre** — l'affichage des discussions seedées fonctionne, l'envoi échoue silencieusement en `fatalError`.
- **Correctifs** (indépendants de #11) : masquer/réduire la carte quand le panneau est ouvert ; dédupliquer starters/follow-ups ; reprise < 24 h ; décaler la colonne de contenu **entière** (en‑tête inclus) à ≥ 1280 px ou passer sur `ResponsivePanel` (recommandé — devient l'étape 1 de #11) ; régénérer `SCR-07-tuteur-ouvert` et les baselines associées.

### #13 — Quiz global micro « Rien à revoir » vs « Quiz global 14 » — Majeur (provisoire) → cause exacte trouvée
- **Vérification live** : `/quiz-global?mode=micro` → 200 + « Rien à revoir aujourd'hui / Toutes vos notions sont à jour » ; en base : 23 notions dues à l'instant figé (14 `in_review` — le badge du menu, comptage vivant [sidebar.ts:147-158](packages/services/src/sidebar.ts#L147) ; 9 hors révision dont 6 **sans aucune question**), et une **session complète du jour déjà jouée** : activité `global_quiz_session` `for_date=2026-11-11` avec tentative **graded 40 %** (id v4 = créée par l'application, horodatée à l'heure figée), qui a marqué les 5 briques de révision seedées comme « empreinte vue ».
- **Mécanique** : `composeMicroSession` ne sert **jamais** une variante déjà répondue (BR‑MEM‑07, [micro-composition.ts:61-99](packages/services/src/review/micro-composition.ts#L61)) ⇒ 0 item ⇒ `emptyDto('empty')` ([global-quiz.ts:1223-1231](packages/services/src/review/global-quiz.ts#L1223)) ⇒ message trompeur « toutes vos notions sont à jour » alors que 14 sont dues ; la demande de régénération est bien émise (job `question_bank` raison `exhaustion` — visible en base, 0 question insérée) mais **échoue en QA à cause de CT‑2**. La carte accueil (« Rien à revoir · prochaine révision 2026‑11‑12 ») est la branche « session du jour terminée » de `readTodayQuizCard` — cohérente avec l'état réel. L'entrée d'agenda « 14 notions · 10 min » est un **libellé statique seedé** (fidélité maquette).
- **Trois sources mesurent trois choses différentes** : menu = notions dues en révision (vivant) ; agenda = libellé statique ; page/carte = variantes jamais répondues disponibles. La contradiction signalée est réelle mais le message est faux : des notions SONT dues, c'est la banque qui est épuisée.
- **Correctif** :
  1. QA (déblocage) : réinitialiser l'état dérivé des comptes de démo à chaque déploiement — phase de purge dans la seed (ou service `qa-reset` sur le modèle de `rate-limit-reset`) supprimant `activities`/`attempts`/`answers`/`review_logs` des kinds créés à l'exécution pour les utilisateurs démo, sur le modèle exact de `restoreDemoSession` ; **scopée strictement aux comptes de démo** ;
  2. produit : distinguer « rien n'est dû » de « variantes en préparation » — DTO vide avec note explicite quand `dueCount > 0` mais tirage vide (l'état `refill` est déjà identifiable dans le code), idem carte accueil ; option : la carte affiche « 14 notions revues aujourd'hui » pour une session terminée ;
  3. avec CT‑2 corrigé, la régénération de variantes fonctionne ⇒ la boucle « épuisement → job mock → variantes » redevient jouable en recette.
- **Tests** : intégration seed « re‑seed d'une base dérivée ⇒ session micro non vide » (échoue aujourd'hui — c'est le test du bug) ; unitaire `composeMicroSession` (tout vu + dues ⇒ note dédiée) ; e2e QA « jouer la session complète puis recharger ?mode=micro ⇒ pas de "rien à revoir" tant que le badge > 0 ».

### Fautes de texte (observations des fiches #11/#12) — localisées
- « Explique‑moi **les rôle** utilisateur autrement » : gabarit figé [starters.ts:83](packages/services/src/tutor-chat/starters.ts#L83) (« les » invariable + libellé de notion singulier du seed) — **figé par un test** (`starters.test.ts:29`) ; correction = décision produit (reformulation neutre ou article par notion) + resynchronisation du test.
- « **Vos 1 apports** » : deux emplacements ([messages/fr/tutorChat.ts:5-8](apps/web/messages/fr/tutorChat.ts#L5) et [conversations.ts:135,140](packages/services/src/tutor-chat/conversations.ts#L135)) — pluriel conditionnel (motif existant `${count === 1 ? '' : 's'}`) ; tests à resynchroniser (`conversations.test.ts:170-176`).
- « Ce chapitre présente architecture de sap s/4hana… » : gabarit de contenu du seed ([demo.ts:1413](packages/db/src/seed/demo.ts#L1413) — `toLowerCase()` sans article) ; le même gabarit duplique le titre de chapitre dans le H2 de section ⇒ « Architecture de SAP S/4HANA » ×3 à l'écran (titre de page, H2 de section, sommaire).

---

## 4. Plan d'implémentation priorisé

> Processus : respecter la boucle SDD du dépôt. Les corrections **produit** partent en branches `spec/…` ou `fix(…)` avec tests ; les corrections de **seed/pile QA** sont des `fix(SPEC-115)`/`build(...)` suivis d'un redéploiement de la pile (la seed est rechargée à chaque déploiement). Après chaque vague : `pnpm run lint && typecheck && test:unit && test:int`, e2e ciblés, régénération des baselines visuelles touchées, puis redéploiement QA + re‑vérification (§6).

### Vague 0 — Débloquer la recette (données + pile QA) — 1 à 2 jours
| Correctif | Bugs débloqués | Fichiers clés |
|---|---|---|
| **0.1 Abonnement IA actif pour les comptes de démo** (CT‑2) : upsert `subscriptions` (`active`, `current_period_end` > horloge figée, plafond journalier confortable) pour Alex/Camille/Hugo | #10 (la génération réussit), #12 (le chat répond), #13 (la régénération de variantes fonctionne), banque de questions (#5 après délai) | `packages/db/src/seed/demo.ts`, contrôles seed + tests |
| **0.2 Auto‑cohérence de la seed « reprise »** : insérer `m0` (missed) + `m0-buffer` ; libérer les créneaux proposés (`j2`, `v3`) ; ajouter `expiresAt` | #7, #8 | `packages/db/src/seed/demo.ts`, `demo-fixtures.ts`, ADR successeur à ADR‑0322 |
| **0.3 Reset de l'état dérivé des comptes de démo** à chaque déploiement (sessions jouées, tentatives, réponses, empreintes) | #13 (et santé générale de la démo) | seed ou service `qa-reset`, modèle `restoreDemoSession` — scopé comptes démo |
| **0.4 Limiteur sain en QA** : `RATE_LIMIT_MODE=off` (garde `APP_ENV=local`, branché sur `noopRateLimiter`) puis retrait du conteneur de purge ; à défaut purge 60 s | #1 (définitif) | `apps/web/lib/api/bootstrap-security.ts`, `docker/compose.coolify-qa.yml` |
| **0.5 Quiz module 3 jouable en QA** : `retryAvailableAt` seedé ≤ 12:20Z (+ resynchroniser les assertions e2e « 14:00 ») | #5 (recette du quiz) | `packages/db/src/seed/demo-fixtures.ts:1674`, `remediation.spec.ts` |

### Vague 1 — Corrections produit rapides (UI/UX + observabilité) — 2 à 4 jours
1. **#9** `cursor-pointer` sur les 3 groupes de boutons natifs du bandeau (1 fichier) + libellés de créneaux référencés sur `createdAt` (stabilité des dates affichées).
2. **#3** garde anti‑débordement sur les tuiles du bilan + composant `StatTile` générique + passage sur les emplacements recensés.
3. **#2** `grow` de la carte « Quiz global » (+ largeur de colonne optionnelle).
4. **#4** croissance conditionnelle de la carte échauffement (`done ? self-start : flex-1`).
5. **#6** fil d'Ariane canonique sur les 8 écrans (remplacement mécanique, baselines à régénérer).
6. **#5 UX** : état dédié « nouvelle tentative possible <date> » + pastille de tentative correcte + contrat `RETRY_NOT_YET_ALLOWED`.
7. **#7/#8 observabilité** : messages d'erreur distincts dans `proposalErrorMessage` (+ idem panneaux d'accueil pour 429/401 — recouvre le fond résiduel de #1).
8. **Fautes de texte** : « Vos 1 apports » (pluriel conditionnel ×2 + tests), contenu de chapitre du seed (article, casse, doublon de titre) ; décision produit pour l'accord des starters (« les rôle »).

### Vague 2 — Corrections produit structurantes — 1 à 2 semaines
1. **#10** statut de génération persistant + champ `courseGeneration` dans `ModuleScreen` + bandeau dynamique + relance effective après échec (plan détaillé §3/#10, étapes A‑D).
2. **#13 produit** : distinction « rien de dû » vs « variantes en préparation » (DTO, messages, carte accueil).
3. **#12** : masquage/déduplication de la carte, reprise < 24 h (EF‑15), migration sur `ResponsivePanel` (étape 1 de l'évolution #11, livrable seul).

### Vague 3 — Évolution #11 (bulle flottante contextuelle) — gouvernance puis 6 étapes
1. ADR « conversation générique du tuteur » + mise à jour BR‑TUT‑01/07 + spécification ;
2. `TutorPanel` → `ResponsivePanel` (si non déjà livré en vague 2) ;
3. `TutorBubble` + `TutorPageContext` dans `AppShell` (carte SCR‑07 réduite en point d'entrée, suppression du décalage) ;
4. migration conversation générique (`scope`, `course_id` nullable, endpoints) ;
5. contextes par page ;
6. tests complets + baselines desktop/mobile.

---

## 5. Risques transverses

- **Baselines visuelles** : #2, #3, #4, #6, #12 touchent ~15 fichiers de captures (recensement exact dans les rapports intégrés) — à régénérer consciemment, pas à désactiver.
- **Comptes SPEC‑115** : 0.2 et 0.3 changent le décompte des créneaux/agenda attendu par les contrôles de seed et `spec-115.spec.ts` — resynchroniser dans le même commit (la seed « tolérante » masquerait sinon silencieusement les écarts en QA mais pas en e2e).
- **e2e à resynchroniser** : `remediation.spec.ts` (dates « 14:00 »), `reprise.spec.ts` (son `restoreSeed` devient redondant), `spec-115.spec.ts` (compte), assertions `module-notice` (3 suites, pour #10).
- **Gardiens à ne pas affaiblir** : `lockSlot`/`assertFree` (reprise), garde de délai (retry) — les correctifs portent sur les **données** et l'**UX**, jamais sur les contrôles.
- **Interdits** : pas de `Date.now()` hors horloge injectée (ADR‑0047) ; jamais copier `rate-limit-reset` ni un mode « limiteur off » en production (garde explicite `APP_ENV=local` + test) ; `design/maquettes/` et `docs/legacy/` intouchables.
- **Homoglyphe** (CT‑1) : résoudre les identifiants par seed/titre dans tous les artefacts écrits.

## 6. Checklist de re‑vérification sur la pile redéployée
1. Accueil : les 3 panneaux chargent ; scroller > 120 requêtes sans 429 ; message explicite si 429 (si mode limiteur conservé).
2. Bandeau « Le tuteur propose » : Accepter ⇒ « Séance replacée » + créneau en base (`moved_from_id`) ; pastille « Autre créneau » ⇒ créneau enregistré ; « Ne pas replacer » ⇒ refus propre ; curseur main ; libellés datés cohérents.
3. Quiz de validation module 3 : la page propose la tentative 2 (pastille correcte) ; démarrage possible en mode micro/full jusqu'au résultat.
4. Quiz global micro : session non vide sur le jeu reseedé (14 notions, variantes disponibles) ; après une session jouée, message honnête « variantes en préparation » ; le badge menu et la page racontent la même histoire.
5. Génération de cours : bandeau « en cours » → « prêt » → lien vers le cours ; en cas d'échec simulé, « échec » + relance réellement effectif.
6. Chat tuteur : envoi de message ⇒ réponse mock en flux ; panneau flottant sans recouvrement de la cloche ; pas de suggestion dupliquée ; reprise de la dernière discussion.
7. Accueil : colonnes équilibrées, aucune carte étirée, « Non disponible » (ou toute valeur longue) contenue dans sa tuile, fil d'Ariane homogène sur les 9 écrans.
