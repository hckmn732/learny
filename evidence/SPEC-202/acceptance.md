# SPEC-202 — critères d'acceptation

Mesures du 2026-11-12 sur la pile Supabase locale (`pnpm dev:up`, e-mails reçus dans le Mailpit du
CLI Supabase, ADR-0252), horloge figée ADR-0047 et IA `LLM_MODE=mock`. Les sessions et les
comptes des tests sont de vrais comptes Supabase Auth ; les mots de passe sont générés à
l'exécution. Preuves : `unit.json` (82 tests `[SPEC-202]`), `integration.json` (23 tests
`[SPEC-202]`), `e2e.json` et les vidéos de `video/`. Les maquettes n'ont pas été modifiées.

- ✅ **CA-1** — Inscription par lien magique de bout en bout : e-mail « Confirmez votre adresse
  e-mail » (nouvelle adresse) ou « Votre lien de connexion à Learny » (adresse existante), clic →
  session active, redirection `/premiers-pas/profil`, deux lignes `legal_acceptances`, un événement
  `user/signed-up`.
  Preuve : intégration `[SPEC-202] authentification — lien magique` « signs a new account up through
  its e-mail, once only » (sujet du message, lien `type=signup`, cookies de session `HttpOnly`,
  redirection `/premiers-pas/profil`, `method: magic_link`, un seul événement) et « sends the sign-in
  template to an address that already exists » (sujet « Votre lien de connexion à Learny »,
  `type=magiclink`) ; `[SPEC-202] authentification — mot de passe` « sign-up, confirmation, then
  sign-in with cookies » (lignes `cgu` et `privacy`, `terms_version`, fuseau `America/New_York`
  enregistré, un événement `id: user-signed-up:<userId>`). E2E `@SPEC-202` « inscription et connexion
  par lien magique puis déconnexion » : e-mail lu dans Mailpit, lien suivi, URL `/premiers-pas/profil`,
  page de démonstration « Connecté : <id> · étape d’onboarding profil » (vidéo, capture
  `screenshots/…spec-202-connecte.png`).
- ✅ **CA-2** — Inscription par mot de passe : < 12 caractères → 400 ; ≥ 12 → e-mail de confirmation ;
  connexion avant confirmation → 403 `EMAIL_NOT_CONFIRMED` ; après → 200 et cookies.
  Preuve : unitaire `[SPEC-202] contrats` (11 refusés, 12 et 72 acceptés, 73 refusé) ; intégration
  « refuses a password shorter than 12 characters » (`body.password`), « sign-up, confirmation, then
  sign-in with cookies » (403 avec le détail « Vérifiez votre adresse e-mail avant de vous
  connecter. », aucun cookie, puis 200 `{ destination: '/premiers-pas/profil' }` avec cookies `sb-…`) ;
  e2e `@SPEC-202` « mot de passe et renvoi limité ».
- ✅ **CA-3** — Un second envoi dans les 60 s renvoie 429 `RESEND_TOO_SOON` avec `Retry-After` entre 1
  et 60 et Mailpit ne contient qu'un message.
  Preuve : intégration « refuses a second sending within 60 seconds with Retry-After » (429, en-tête
  entre 1 et 60, détail « Vous pourrez renvoyer le lien dans N secondes. », `mailCount = 1`, y compris
  après `POST /auth/resend`) ; unitaire `[SPEC-202] correspondance des erreurs` (extraction des
  secondes, bornes 1 à 60) ; e2e : compte à rebours affiché et un seul message reçu.
- ✅ **CA-4** — Un lien magique déjà utilisé ou invalide redirige vers
  `/connexion?erreur=lien-invalide`.
  Preuve : intégration « signs a new account up through its e-mail, once only » (second clic → 302
  `/connexion?erreur=lien-invalide`, aucun cookie de session, toujours un seul événement) et
  « redirects an invalid, missing or forged token to the invalid-link page » (jeton inconnu, jeton
  absent, type interdit, requête vide ; `Cache-Control: no-store`).
- ✅ **CA-5** — Le middleware (proxy Next 16, ADR-0252) redirige : page protégée sans session →
  `/connexion?suite=…` ; onboarding à `rythme` → `/premiers-pas/rythme` ; `next` externe ignoré.
  Preuve : unitaires `apps/web/lib/route-guard.test.ts` (pages publiques, `suite` encodée,
  chemins `/api`, redirection d'un connecté hors des pages de connexion, étapes `profil|rythme|ia`,
  cookie `lr-onboarded`) et `destination.test.ts` (11 `next` dangereux ignorés, `//evil.example`,
  `https://…`, `\`, retours à la ligne) ; intégration « step … → … (CL-5, CL-6) » (8 cas dont la
  suppression programmée) ; e2e `@SPEC-202` « le proxy garde les pages et l’onboarding » : `/agenda`
  anonyme → `/connexion?suite=%2Fagenda%3Fsemaine%3D2`, étape `rythme` → `/premiers-pas/rythme`, étape
  `rappels` → `/agenda` et cookie `lr-onboarded`, `/connexion` d'un connecté → `/accueil`.
- ✅ **CA-6** — La déconnexion renvoie 204, supprime les cookies et une requête ultérieure à une route
  `auth: 'user'` renvoie 401.
  Preuve : intégration « closes the session, clears the cookies and refuses the old token » (204, cookies
  `sb-…`, `lr-onboarded` et `lr-next` expirés, l'ancien jeton et l'absence de cookie donnent 401 sur
  `GET /api/v1/dev/sdd/items`, deuxième déconnexion sans session : 204) ; e2e : « Non connecté » puis
  `/accueil` → `/connexion?suite=%2Faccueil`.
- ✅ **CA-7** — Aucune réponse ne révèle l'existence d'un compte (mêmes statut et corps pour adresse
  connue et inconnue en `sign-in` par lien et en `sign-up`).
  Preuve : intégration « does not reveal whether an address has an account on sign-in » (202, corps
  identiques, aucun e-mail pour l'adresse inconnue), « gives the same answer for an address already
  registered » (201 `{ status: 'confirmation_sent' }`, un seul compte en base), « answers 401
  INVALID_CREDENTIALS for a wrong pair, known or unknown » (corps problem+json identiques hors
  `requestId`).

Écarts à la spécification, justifiés dans l'ADR-0252 : `middleware.ts` devient `proxy.ts` (Next 16) ;
la redirection du rappel est relative ; `next` d'une connexion par lien voyage dans le cookie
`lr-next` ; e-mails locaux dans le Mailpit du CLI Supabase ; `/` reste public pour un anonyme jusqu'à
SPEC-601. Aucun client Supabase administrateur : `finalize.ts` suffit.
