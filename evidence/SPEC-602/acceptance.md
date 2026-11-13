# SPEC-602 — critères d'acceptation

- ✅ **CA-1** — Les six états affichent exactement les textes de la section 5 ; comparaisons desktop ≤ 12 %.
  Preuve : `e2e.json` tests « conformité SCR-02 premiers pas » et « mobile », captures `screenshots/`,
  comparaisons `visual/` ; `ProfileStep.test.tsx`, `AiStep.test.tsx`, `RemindersStep.test.tsx`.
- ✅ **CA-2** — Chaque « Continuer » persiste les données et avance `onboarding_step` d'un cran, jamais en arrière.
  Preuve : `integration.json` `onboarding.test.ts` (avance monotone, rappels), e2e clé personnelle
  (contrôles SQL `tutor_tone`, `course_language`, `timezone`, `study_preferences`, `notification_settings`,
  `automation_settings`).
- ✅ **CA-3** — Reprise : étape IA → `/premiers-pas/ia` et `/accueil` redirigé ; étape Rappels → `/accueil` ouvert.
  Preuve : e2e « reprise de l’onboarding et clé refusée », `onboarding-ticket.test.ts`, `route-guard.test.ts`.
- ✅ **CA-4** — Clé qualifiée → statut vert et 5 lignes `ai_task_models` ; `auth_failed` → refus et Continuer bloqué.
  Preuve : e2e clé personnelle et « clé refusée », `AiStep.test.tsx`, `integration.json`.
- ✅ **CA-5** — IA fournie sans abonnement → Checkout mock puis Départ activé ; annulation → alerte EF-14.
  Preuve : e2e « premiers pas avec IA fournie et paiement », captures `depart-abonnement-ok` et
  `depart-abonnement-annule`.
- ✅ **CA-6** — Résumé du rythme exact pour 3 configurations ; jours et moments non vidables.
  Preuve : `RhythmSummary.test.ts` (3 cas tabulés + désélection ignorée), e2e résumé 5 h / matin et après-midi.
- ✅ **CA-7** — Première action de Départ : `onboarding_step = 'done'`, un seul `user/onboarding-completed` ;
  invitation simulée avec titre et prénoms.
  Preuve : e2e clé personnelle et « rejoindre par invitation » (contrôle SQL), `onboarding.test.ts`
  (deux appels `done`, un événement).
- ✅ **CA-8** — Aucune violation axe serious/critical ; parcours complet au clavier.
  Preuve : `axeCheck` sur chaque parcours et les deux tests visuels ; rapports `attachments/axe-*.json`.
