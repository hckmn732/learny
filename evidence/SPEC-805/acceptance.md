# SPEC-805 — critères d’acceptation

Date du rapport : 2026-11-17 · Branche : `spec/SPEC-805-securite` · Commit de référence : `40923d62`

- ✅ **CA-1** — Deux réponses HTML ont des nonces distincts ; la CSP et les quatre autres en-têtes sont présents dans les environnements prescrits, sans `unsafe-eval`.
  - Preuve : `apps/web/lib/security/csp.test.ts` (nonce, directives, environnements, sources inconnues) ; `apps/web/test/integration/security-headers.test.ts` (deux nonces distincts, en-têtes, HSTS production HTTPS, absence de HSTS local) ; e2e `parcours protégé @SPEC-805` (nonces réutilisés sur les scripts, script sans nonce bloqué) ; `evidence/SPEC-805/e2e.json` et vidéo associée.
- ✅ **CA-2** — Origine étrangère et quota atteint refusent une mutation sans écriture ; l’API renvoie les codes et en-têtes attendus.
  - Preuve : `apps/web/test/integration/security-headers.test.ts` (403 `ORIGIN_REJECTED`, service non exécuté, 429 avec `Retry-After`, compteur bloqué) ; e2e `parcours protégé @SPEC-805` (inscription d’origine étrangère refusée, aucun compte créé) ; `evidence/SPEC-805/integration.json`.
- ✅ **CA-3** — Les tests croisés couvrent toutes les tables et fichiers privés ; aucune lecture, écriture ou export d’un autre utilisateur ne réussit.
  - Preuve : `packages/testing/test/integration/rls-security.test.ts` (inventaire complet `RLS_MATRIX` confronté à `pg_tables`/`pg_policies`, lecture/écriture/suppression refusées pour B, apports privés invisibles malgré le groupe partagé, chemin et URL signés refusés) ; `evidence/SPEC-805/integration.json`.
- ✅ **CA-4** — Les cinq tâches IA ignorent les injections testées et n’exécutent aucun outil hors garde ; les URL interdites et leurs redirections sont bloquées.
  - Preuve : `packages/tutor/test/integration/prompt-injection.test.ts` (`programme`, `course`, `tutor`, outil refusé par `guard` jamais exécuté) ; `packages/services/test/integration/prompt-injection.test.ts` (`gaps`, `light`, piège absent du prompt système, données balisées) ; `packages/ingestion/test/integration/ssrf.test.ts` (schémas, loopback, privées IPv4/IPv6, link-local, redirections, rebind DNS, taille et délai) ; `evidence/SPEC-805/integration.json`.
- ✅ **CA-5** — Audit des dépendances sans vulnérabilité haute/critique non traitée, grille ASVS niveau 1 entièrement reliée à une preuve pour chaque contrôle applicable.
  - Preuve : `pnpm audit --audit-level high --json` → 0 haute, 0 critique (`evidence/SPEC-805/pnpm-audit.json`, synthèse `audit.json`) ; `docs/security/asvs-v1-l1.md` (37 contrôles : 35 vérifiés avec lien existant, 2 non applicables justifiés) et `apps/web/lib/security/asvs.test.ts` qui vérifie chaque lien ; copie `evidence/SPEC-805/asvs-v1-l1.md`.
- ✅ **CA-6** — La page de démonstration affiche les statuts réels ou « Non exécuté », passe axe et le test visuel, avec vidéo.
  - Preuve : e2e `parcours protégé @SPEC-805` (six catégories `spec-805-*`, 14 lignes, statuts limités à Vérifié/Échec/Non exécuté, aucun contenu d’attaque affiché) ; e2e `contrôles de sécurité conformes @SPEC-805 @visual @mobile` (jetons, structure, axe, captures desktop/mobile, `toHaveScreenshot('spec-805-demo.png', { maxDiffPixelRatio: 0.01 })`) ; `evidence/SPEC-805/screenshots/`, `evidence/SPEC-805/visual/` et `evidence/SPEC-805/video/`.

## Non-régression

Les suites unitaires et d’intégration complètes sont exécutées par `validate.mjs` ; les e2e de la spécification et les tests visuels desktop/mobile passent. Les rapports réels sont dans `evidence/SPEC-805/unit.json`, `integration.json`, `e2e.json` et `e2e.xml`.
