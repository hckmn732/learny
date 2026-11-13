# SPEC-601 — critères d'acceptation

Chaque critère est relié aux tests réellement exécutés par `node tools/sdd/validate.mjs SPEC-601` ;
les rapports et vidéos sont dans `evidence/SPEC-601/`.

- ✅ CA-1 — Les trois routes affichent les textes et l'ordre des régions attendus ; le test `conformité SCR-01 compte, connexion et vérification @SPEC-601 @visual` vérifie les jetons, la structure et compare les trois états desktop aux références (`evidence/SPEC-601/visual/`, écart ≤ 12 %).
- ✅ CA-2 — Inscription par lien magique de bout en bout : l'e-mail arrive dans Mailpit, le lien mène à `/premiers-pas/profil`, et `legal_acceptances` contient deux lignes à la version `2026-11-11` (e2e « inscription par lien magique jusqu'aux premiers pas », intégration « parcours d'authentification »).
- ✅ CA-3 — Inscription par mot de passe : 11 caractères refusés avec le message exact, solidité de 0 à 4 barres selon EF-5 (`password-strength.test.ts`), aucune session avant confirmation (intégration sign-up + e2e « inscription par mot de passe et solidité »).
- ✅ CA-4 — Sans case CGU : aucune requête n'est envoyée et « Acceptez les conditions pour créer votre compte. » s'affiche (`AccountForm.test.tsx`, e2e « inscription par lien magique »).
- ✅ CA-5 — Renvoi impossible pendant 60 s : bouton désactivé avec compte à rebours, puis 429 serveur avec `Retry-After` (e2e « renvoi limité à 60 s », intégration « refuse un second renvoi »).
- ✅ CA-6 — Connexion mot de passe : identifiants faux → message neutre ; corrects → `/accueil` ; lien magique sur adresse inconnue → 202 et écran de vérification identique (e2e « connexion par mot de passe, erreurs et lien expiré », intégration « répond 202 à un lien de connexion pour une adresse inconnue »).
- ✅ CA-7 — `/connexion?erreur=lien-expire` affiche « Ce lien a expiré ou a déjà servi. Demandez-en un nouveau. » (e2e « connexion par mot de passe, erreurs et lien expiré »).
- ✅ CA-8 — Aucune violation axe serious/critical sur les trois écrans ; parcours clavier du groupe radio couvert par `ChoiceGroup.test.tsx` ; aucune adresse e-mail dans une URL (contrôle de toutes les requêtes dans les e2e).

## Vérifications techniques

- ✅ ET-3 — `passwordStrength` : table de EF-5 couverte mot pour mot.
- ✅ ET-4 — `learny.pendingAuth` : adresse, méthode, intention et `sentAt` en `sessionStorage`, accès protégés par `try/catch` ; aucune donnée personnelle dans l'URL.
- ✅ ET-5 — `LEGAL_DOCUMENTS_VERSION = '2026-11-11'` ; acceptation écrite par `finalizeFirstVerification` (deux lignes + `profiles.terms_version/terms_accepted_at`), vérifiée en intégration.
- ✅ ET-7 — `radiogroup` « Façon de se connecter », `role="radio"` et `aria-checked`, flèches et Espace, focus visible global, alerte `role="alert"`, focus sur le premier champ fautif.
- ✅ ET-8 — Aucun mot de passe journalisé ; appels limités à `/api/v1/auth/*` et `/api/v1/me` ; formulaire `method="post"` neutralisé par `preventDefault` et `fetch`.
- ✅ ET-9 — Les pages ne font aucune requête base au rendu ; mesure du JavaScript client consignée dans `summary.md` après le build.

## Preuves

- `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`.
- `video/` : vidéos des tests `@SPEC-601`.
- `screenshots/` : `inscription-compte`, `connexion`, `verification`, `verification-compte-a-rebours`, `mobile-inscription`.
- `visual/` : comparaisons côte à côte et diffs `SCR-01-inscription`, `SCR-01-connexion`, `SCR-01-verification`.
- `attachments/` : rapports axe.
