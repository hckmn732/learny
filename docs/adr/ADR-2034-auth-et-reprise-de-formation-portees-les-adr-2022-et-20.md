# ADR-2034 — Auth et reprise de formation portées en Python, ADR-2022 et ADR-2024 levées

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2207, SPEC-202, SPEC-618, ADR-2008, ADR-2011, ADR-2022, ADR-2023, ADR-2024

## Contexte

ADR-2022 laissait les six opérations `auth.*` en TypeScript faute de pouvoir reproduire le
`Set-Cookie` de `@supabase/ssr` « octet pour octet », et faute d'enregistrement de parité. ADR-2024
laissait `formations.resume` en TypeScript parce que le planificateur n'existait pas encore côté
Python. Les deux causes ont disparu : le planificateur de SPEC-2202 est porté
(`learny/learning/domain/planner.py`, `learny/learning/application/planning.py`) et la bibliothèque
`@supabase/ssr` installée (0.12.7) est lisible, donc son adaptateur de stockage est reproductible
exactement.

## Décision

1. **`auth.*` passe à `py`** (six opérations, plus la route spéciale `GET /api/v1/auth/callback`).
   `learny/identity/infrastructure/auth_cookies.py` reproduit l'adaptateur de `@supabase/ssr` :
   nom `sb-<premier label de l'hôte>-auth-token`, encodage `base64url` par défaut, découpage à
   3180 caractères sur la forme encodée, et l'ordre d'attributs de `cookie` 1.1.1
   (`Max-Age`, `Path`, `HttpOnly`, `Secure` sauf localhost, `SameSite=Lax`). La valeur du cookie est
   la sérialisation compacte du document GoTrue **brut** : `GoTrueSession` conserve désormais ce
   document (`document`), donc l'ordre des clés et les octets sont ceux du serveur d'authentification.
2. **Preuve par enregistrement.** `api/oracles/vectors/auth-cookies.json` contient sept échanges
   réellement servis par `@learny/api` (Hono) à travers `@supabase/ssr` 0.12.7 : cookie simple,
   cookie découpé en deux morceaux, cookie `lr-next` d'un lien magique, inscription, déconnexion,
   callback vérifié et lien invalide. Le test d'intégration rejoue le document GoTrue de chaque cas
   dans un client simulé et compare les en-têtes octet pour octet. Les jetons sont factices : aucun
   secret réel n'est stocké. Le document GoTrue de l'enregistrement est produit par un bouchon
   déterministe, la pile Supabase locale servant de cadre ; la seule différence avec un jeton réel
   est la longueur et la valeur du jeton, jamais la forme.
3. **Parité corrigée.** `supabaseSessionResolver` rend `null` quand le serveur d'authentification
   refuse un cookie de session : c'est une requête anonyme, pas une erreur. Le portage Python levait
   `UNAUTHENTICATED`, ce qui interdisait la déconnexion sans session (CL-10, réponse 204) et
   divergeait du TypeScript. `_cookie_actor` rend maintenant `None` ; un jeton Bearer invalide ne
   retombe toujours pas sur le cookie (ET-3, CL-6).
4. **`formations.resume` passe à `py`.** `resume_formation` rejoue la transaction de
   `packages/services/src/formations/resume.ts` et réutilise
   `learny.learning.application.planning.replan_formation_in_tx`, qui porte déjà
   `replanFormationAfterResume`. Le doublon `replan_formation_after_resume` de
   `learny.engagement.application.pause` (même corps, deux imports locaux) est supprimé : une seule
   règle de planification, comme l'exige l'ADR-2011 section 4.
5. **ADR-2023 reste ouverte.** `home.get` agrège 18 lectures SQL (1 340 lignes de TypeScript entre
   `packages/services/src/home/get-home.ts` et `packages/domain/src/home/derive.ts`) et n'a **aucun
   test** dans `api/inventory.json` : le porter sans oracle demanderait plus que le budget d'une
   route de cette tranche. Il reste `ts` et figure dans `evidence/SPEC-2207/handover.md` §9.

## Conséquences

Identity et formation sont servis entièrement par Python ; la façade ne relaie plus aucune opération
d'authentification. ADR-2022 et ADR-2024 sont remplacées. Toute évolution de `@supabase/ssr` doit
être confrontée au vecteur enregistré : le test échoue si la bibliothèque change de format, ce qui
est le comportement voulu (le TypeScript n'est plus qu'un filet de sécurité jusqu'à SPEC-2302).
