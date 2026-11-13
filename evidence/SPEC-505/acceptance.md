# SPEC-505 — critères d'acceptation

- ✅ CA-1 — `packages/llm/src/credentials/crypto.test.ts` : aller-retour, surcoût de 28 octets, IV aléatoire, octet altéré et AAD d'une autre ligne refusés ; `packages/llm/test/integration/credentials.test.ts` (CL-2).
- ✅ CA-2 — `packages/llm/test/integration/credentials.test.ts` : rotation de 250 lignes, interruption simulée après le premier lot, reprise, déchiffrement avec la seule nouvelle clé et rotation paresseuse (ET-3).
- ✅ CA-3 — `apps/web/test/integration/ai-credentials-routes.test.ts` (réponses et journal du service sans clé), `apps/web/e2e/specs/p5/spec-505-credentials.spec.ts` (JSON brut et HTML sans `0000000000`), vidéo de preuve.
- ✅ CA-4 — `packages/llm/src/credentials/mask.test.ts` (`sk-••••••••a91F`, `••••••••7Kq2`) et parcours e2e.
- ✅ CA-5 — `packages/llm/src/providers/catalog.test.ts` : hors UE et notes des six fournisseurs ; note colorée vérifiée en e2e.
- ✅ CA-6 — `apps/web/test/integration/ai-credentials-routes.test.ts` (12 cas de validation, `URL_BLOCKED_HOST`, `LOCAL_MODELS_DISABLED`, `CREDENTIAL_LIMIT_REACHED`, doublon 409) et `packages/core/src/net/assert-public-url.test.ts` (30 adresses).
- ✅ CA-7 — `apps/web/test/integration/ai-credentials-routes.test.ts` : liste vide pour B, suppression de la clé de A en 404, clé conservée ; suppression des deux affectations de tâches (CL-6).
- ✅ CA-8 — `apps/web/e2e/specs/p5/spec-505-credentials.spec.ts` : ajout OpenAI, masque, pastille « Hors UE », suppression confirmée ; vidéo et capture dans `evidence/SPEC-505/`.

## Preuves

- `unit.json`, `integration.json`, `e2e.json`, `checks.json` (générés par `validate.mjs`).
- `video/` : parcours e2e avec vidéo Playwright.
- `screenshots/` : formulaire, carte masquée et panneau de stockage.
- `visual/` : comparaison de la démonstration (`spec-505-demo.png`).
- `rotation.txt` : sortie réelle du test de rotation interrompue puis reprise.
