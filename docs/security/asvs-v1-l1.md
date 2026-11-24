# OWASP ASVS 4.0.3 — niveau 1 (Learny V1)

Grille de conformité de la V1 (SPEC-805 EF-8, CA-5). Chaque ligne est reliée à un test ou à un
document du dépôt ; `tools/sdd` et `apps/web/lib/security/asvs.test.ts` refusent une ligne
« Vérifié » sans preuve existante. Les valeurs de secrets, cookies et apports ne figurent jamais
dans cette grille.

| Réf. | Contrôle niveau 1 | Statut | Preuve | Responsable |
|---|---|---|---|---|
| V1.1.1 | Cycle de développement sécurisé documenté | Vérifié | [sdd-process.md](../../docs/engineering/sdd-process.md) | platform |
| V1.2.1 | Architecture et frontières de confiance décrites | Vérifié | [overview.md](../../docs/architecture/overview.md) | platform |
| V1.5.1 | Entrées et sorties validées aux frontières | Vérifié | [validate.test.ts](../../packages/http/src/validate.test.ts) | api |
| V2.1.1 | Politique de mot de passe et résistance | Vérifié | [password-strength.test.ts](../../apps/web/lib/auth/password-strength.test.ts) | auth |
| V2.2.1 | Anti-automatisation des connexions | Vérifié | [rate-limit.test.ts](../../apps/web/test/integration/rate-limit.test.ts) | api |
| V2.7.1 | Vérification d’identité déléguée à GoTrue | Vérifié | [auth-screens.test.ts](../../apps/web/test/integration/auth-screens.test.ts) | auth |
| V2.8.1 | Second facteur d’authentification | Non applicable | Aucun parcours MFA n’est exposé en V1 ; GoTrue reste la seule autorité d’authentification. | auth |
| V3.1.1 | Jeton de session jamais accepté depuis l’URL | Vérifié | [auth-routes.test.ts](../../apps/api/test/integration/auth-routes.test.ts) | auth |
| V3.3.1 | Déconnexion invalide la session | Vérifié | [logout-menu.test.ts](../../apps/web/test/integration/logout-menu.test.ts) | auth |
| V3.4.1 | Cookies de session HttpOnly, SameSite et Secure hors local | Vérifié | [auth-screens.test.ts](../../apps/web/test/integration/auth-screens.test.ts) | auth |
| V4.1.1 | Contrôle d’accès au niveau objet (RLS) | Vérifié | [rls-security.test.ts](../../packages/testing/test/integration/rls-security.test.ts) | db |
| V4.2.1 | Contrôle d’accès au niveau utilisateur | Vérifié | [rls-security.test.ts](../../packages/testing/test/integration/rls-security.test.ts) | db |
| V4.3.1 | Principe du moindre privilège | Vérifié | [rls-matrix.test.ts](../../packages/db/test/integration/rls-matrix.test.ts) | db |
| V5.1.1 | Validation positive des entrées | Vérifié | [validate.test.ts](../../packages/http/src/validate.test.ts) | api |
| V5.2.1 | Neutralisation du HTML non fiable | Vérifié | [global-search.test.tsx](../../apps/web/components/search/global-search.test.tsx) | ui |
| V5.3.1 | Encodage de sortie | Vérifié | [components-render.test.tsx](../../packages/ui/test/integration/components-render.test.tsx) | ui |
| V5.5.1 | Désérialisation sûre (JSON validé par Zod) | Vérifié | [validate.test.ts](../../packages/http/src/validate.test.ts) | api |
| V6.2.1 | Aléa cryptographique pour les nonces | Vérifié | [csp.test.ts](../../apps/web/lib/security/csp.test.ts) | app |
| V6.4.1 | Secrets absents du code et du navigateur | Vérifié | [config-boundary.test.ts](../../apps/web/lib/config-boundary.test.ts) | platform |
| V7.1.1 | Aucun identifiant ou secret journalisé | Vérifié | [observability.test.ts](../../apps/web/test/integration/observability.test.ts) | platform |
| V7.3.1 | Données sensibles expurgées des rapports | Vérifié | [observability.test.ts](../../apps/web/test/integration/observability.test.ts) | platform |
| V8.1.1 | Classification et minimisation des données | Vérifié | [data-model.md](../../docs/architecture/data-model.md) | db |
| V8.2.1 | Données client jamais tenues pour acquises | Vérifié | [validate.test.ts](../../packages/http/src/validate.test.ts) | api |
| V9.1.1 | HTTPS et HSTS en production | Vérifié | [csp.test.ts](../../apps/web/lib/security/csp.test.ts) | app |
| V10.1.1 | Redirections validées avant suivi | Vérifié | [ssrf.test.ts](../../packages/ingestion/test/integration/ssrf.test.ts) | ingestion |
| V11.1.1 | Logique métier bornée (quotas, idempotence) | Vérifié | [rate-limit.test.ts](../../apps/web/test/integration/rate-limit.test.ts) | api |
| V12.1.1 | Taille et type des fichiers bornés | Vérifié | [remote.test.ts](../../packages/ingestion/test/integration/remote.test.ts) | ingestion |
| V12.3.1 | Protection SSRF des récupérations serveur | Vérifié | [ssrf.test.ts](../../packages/ingestion/test/integration/ssrf.test.ts) | ingestion |
| V12.5.1 | URL utilisateur validées après résolution DNS | Vérifié | [ssrf.test.ts](../../packages/ingestion/test/integration/ssrf.test.ts) | ingestion |
| V13.2.1 | Requêtes SQL paramétrées (Drizzle) | Vérifié | [rls-matrix.test.ts](../../packages/db/test/integration/rls-matrix.test.ts) | db |
| V14.1.1 | En-têtes de sécurité configurés | Vérifié | [security-headers.test.ts](../../apps/web/test/integration/security-headers.test.ts) | app |
| V14.2.1 | Méthodes HTTP et refus des mutations non prévues | Vérifié | [test_pipeline_install.py](../../apps/api/tests/integration/test_pipeline_install.py) | api |
| V14.3.1 | Vérification d’origine des mutations | Vérifié | [security-headers.test.ts](../../apps/web/test/integration/security-headers.test.ts) | api |
| V14.4.1 | En-têtes de cache adaptés aux données privées | Vérifié | [test_pipeline.py](../../apps/api/tests/unit/test_pipeline.py) | api |
| V14.5.1 | Content-Security-Policy stricte à nonce | Vérifié | [csp.test.ts](../../apps/web/lib/security/csp.test.ts) | app |
| V14.6.1 | CORS restreint | Non applicable | L’API est same-origin ; aucune route ne renvoie `Access-Control-Allow-Origin`. | api |
| V14.7.1 | HSTS sans contournement local | Vérifié | [security-headers.test.ts](../../apps/web/test/integration/security-headers.test.ts) | app |

## Contrôles hors périmètre automatisable

- V1.14.1 (configuration de build reproductible) : vérifié par la CI et le déploiement, hors du
  périmètre de la V1 applicative ; aucune preuve n’est revendiquée ici.
