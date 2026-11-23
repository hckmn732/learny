# Blocages consignés

## 2026-11-23 — SPEC-3101 : le garde d'origine de l'API refuse le client natif

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
