# Blocages

## B-001 — Firefox cross-browser sur l'hôte de développement (2026-11-14)

- **Contexte** : CP-6 exige un cross-browser Chromium / Firefox / WebKit sur les parcours
  principaux. Chromium et WebKit passent (WebKit : 47 tests des parcours P6). Firefox 159
  (build Playwright 1.65, `firefox-1572`) ne peut pas exécuter les pages de l'application sur cet
  hôte : le processus de contenu meurt en `SIGSEGV` dans `libxul.so`, toujours au même offset
  (`libxul.so+0x4c87f14`, instruction d'écriture sur un pointeur nul).
- **Preuves** : `journalctl -b -k` enregistre un `segfault ... in libxul.so` pour chaque test
  Firefox qui échoue ; Playwright rapporte `Page crashed` (14 occurrences sur la campagne
  cross-browser complète, puis reproduit de façon déterministe sur
  `spec-604-cadrage.spec.ts:52`).
- **Tentatives** : désactivation de Fission, de WebRender et du JIT ; désactivation des bacs à
  sable de contenu et GPU ; désactivation de l'ASLR (`setarch -R`) ; désactivation de la vidéo et
  des traces Playwright ; exécution du même build Firefox dans le conteneur officiel
  `mcr.microsoft.com/playwright:v1.65.0-noble`. Le binaire démarre mais le processus de contenu
  reste instable.
- **Décision** : le cross-browser des parcours principaux est exécuté sur **Chromium et WebKit**
  sur cet hôte ; Firefox est explicitement neutralisé par `CROSS_BROWSER_SKIP_FIREFOX=1` pour le
  checkpoint local (`grep: /$^/`), avec ce blocage consigné. Sur un runner compatible
  (Ubuntu 24.04, celui de la CI), la variable n'est pas définie : Firefox rejoue la suite
  complète des parcours P6.
- **Portée** : aucune fonctionnalité produit n'est simplifiée ; les tests Firefox restent dans le
  dépôt et le projet Playwright est inchangé hors opt-out explicite. Les visuels restent validés
  sur Chromium desktop/mobile et les parcours fonctionnels sur WebKit.

## B-002 — Identité légale de l’éditeur non fournie (2026-11-17)

- **Contexte** : SPEC-806 publie les CGU, la politique de confidentialité et les mentions légales.
  Les variables `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `LEGAL_CONTACT_EMAIL` et
  `LEGAL_HOST_NAME` ne sont pas fournies par le porteur du projet. ADR-0045 interdit d’inventer
  une entité.
- **Comportement livré** : les gabarits affichent exactement « [à compléter] » aux endroits
  concernés et un encart annonce l’information à compléter ; aucune page ne présente l’identité
  comme renseignée. `pnpm legal:check` liste les noms des champs manquants sans afficher de valeur.
- **Preuves** : `evidence/SPEC-806/legal-check.txt` (sortie de `pnpm legal:check`),
  `[SPEC-806] legal configuration` et `CA-1, CA-4 — une identité absente reste visible` dans les
  tests d’intégration.
- **Portée** : les pages et l’acceptation serveur sont fonctionnelles en local et en test. SPEC-808
  ne peut pas annoncer la publication V1 tant que ces quatre valeurs ne sont pas fournies en
  prépublication/production ; le contrôle de prépublication échoue alors avec les noms des champs.
- **SPEC-2301** (2026-11-23T01:24:33.788Z, 1 tentative(s)) — staging Coolify non fourni par le porteur : CA-1/CA-2/CA-3/CA-4 non mesurables (ADR-2009, CL-3)

## B-003 — SPEC-3101 : le garde d'origine de l'API refuse le client natif (2026-11-23)

- **Constat** : `packages/services/src/security/origin-guard.ts` refuse toute requête non sûre
  (`POST`, `PATCH`, …) qui ne porte ni en-tête `Origin` ni `Sec-Fetch-Site`
  (`ok = request.origin === null ? request.secFetchSite === 'same-origin' : …`). Un client natif
  (Bearer Supabase, ADR-1005, ADR-3008 § 3) n'envoie jamais ces en-têtes : **toute mutation de
  l'application mobile est refusée** (`403 ORIGIN_REJECTED`), y compris
  `POST /api/v1/auth/sign-up`, `PATCH /me` et `POST /me/legal-acceptances`.
- **Impact** : l'inscription par mot de passe depuis l'application est impossible en l'état ; les
  écrans de SPEC-3101 sont livrés et testés, mais cette route reste refusée au client natif. Le
  test d'intégration `apps/mobile/test/integration/auth.int.test.ts` porte donc l'origine de
  l'application web pour éprouver la route elle-même (constat isolé, pas contourné côté produit).
- **Portée** : hors zone de la piste mobile (ADR-3001 § 4 interdit de modifier `apps/api`, la
  façade et les paquets serveur avant P35). À traiter côté backend (P35 ou spec d'API dédiée) :
  accepter un client natif authentifié par Bearer comme preuve d'origine suffisante, ou exempter
  explicitement les routes `auth.*` et `me.*` sur présentation d'un `Authorization` valide.
- **Consigné par** : agent SPEC-3101, dans `evidence/SPEC-3101/acceptance.md` (écart 3).

## B-004 — SPEC-3402 : identifiants OAuth Apple et Google non fournis (2026-11-23)

- **Contexte** : l'essai réel de `signInWithIdToken` exige un compte développeur Apple (Services ID,
  clé, `usesAppleSignIn` signé) et des clients OAuth Google (web, iOS, Android), fournis par le
  porteur. Aucun n'est disponible sur la VM ; la configuration Supabase locale est partagée et ne
  peut être ni modifiée ni redémarrée (BRIEF-PARALLEL § 2).
- **Comportement livré** : boutons conformes aux règles des stores (bouton système Apple sur iOS,
  marque Google quatre couleurs), flux `expo-auth-session`/`expo-apple-authentication` et
  `@react-native-google-signin/google-signin`, nonce haché, annulation silencieuse, erreurs
  traduites, double appui bloqué, acceptation des CGU avant l'accès. Les builds e2e utilisent un
  fournisseur simulé (`src/auth/providers/mock.ts`) et un compte de campagne recréé sans CGU.
- **Preuves** : `evidence/SPEC-3402/acceptance.md` (CA-1 à CA-4), rapports Vitest/Jest/intégration,
  flux Maestro et comparaison visuelle à 11,23 %.
- **Portée** : l'échange réel avec Apple et Google n'est pas prouvé ; à rejouer sur appareil dès que
  les identifiants sont fournis, sans changement de code attendu. Consigné aussi comme écart 1 de
  `evidence/SPEC-3402/acceptance.md`.
- **SPEC-3501** (2026-11-24T11:17:30.523Z, 1 tentative(s)) — identifiants APNs (cle .p8) et FCM (compte de service) absents : aucun envoi reel possible, tout le canal est livre et prouve en PUSH_MODE=mock, iOS non compilable sans macOS
- **SPEC-3502** (2026-11-24T13:15:50.055Z, 1 tentative(s)) — comptes Apple Developer, Google Play et projet EAS absents, aucun macOS : builds signes, TestFlight, Google Play test interne, flux iOS et VoiceOver non mesurables ; identifiants APNs/FCM absents ; AAB non produit
