# SPEC-013 — critères d'acceptation

Les preuves ci-dessous proviennent des validations locales du 2026-11-11 (horloge figée
`2026-11-11T12:20:00Z`, `LLM_MODE=mock`). Aucun projet Vercel, Supabase ou Inngest réel n'étant
fourni, aucun déploiement, aucune URL de preview et aucun succès de production n'est annoncé.

- ✅ CA-1 — La configuration fixe web/base/jobs en UE et refuse une région non autorisée.
  Preuves : `regions.txt` (`vercel=fra1`, `supabase=eu-central-1`, `inngest=eu`, tous `EU=oui`) ;
  `unit.json` (22 tests `[SPEC-013]`, dont l'égalité avec `HOSTING_REGIONS`/`EU_REGIONS`,
  le refus de `iad1`, `us-east-1`, `us` et d'une région UE inattendue) ; `dry-run-preview.json`
  (`status: ok`, régions déclarées).
- ✅ CA-2 — `--dry-run` vérifie les variables, liste les actions et n'effectue aucune mutation distante.
  Preuves : `integration.json` (12 tests `[SPEC-013]`, compteur d'appels à zéro pour `migrate
  --dry-run` et pour `sync --dry-run`) ; `dry-run-preview.json` (5 actions, destinations masquées,
  avertissements de dépendances externes) ; `dry-run-migrate.txt` (aucun `db push`, aucun
  `db:reset`) ; `dry-run-sync.txt` (aucun appel réseau).
- ✅ CA-3 — Le workflow preview n'utilise que ses secrets avec une CI verte ; le workflow production
  exige un tag `v*` de `main` et s'arrête sur migration ou synchronisation échouée.
  Preuves : `unit.json` et `integration.json` (règles `validateDeployWorkflow` : `workflow_run` sur
  `CI`/`completed`, `head_sha` exact, environnements `preview`/`production` distincts, aucun secret
  `PRODUCTION_*` en preview, `ENABLE_SDD_PAGES=false` en production, `git merge-base` sur
  `origin/main`, ordre sauvegarde → migration → Inngest → Vercel → fumée, échec Inngest sans
  fonction) ; `workflow-validation.txt` (actionlint 1.7.7 OK, aucun run GitHub prétendu).
- ✅ CA-4 — Le guide donne les variables, l'ordre des migrations, les fumées et le retour arrière,
  sans secret fictif.
  Preuves : `docs/operations/deployment.md` (matrice, secrets préfixés `PREVIEW_*`/`PRODUCTION_*`,
  régions, ordre, migrations, retour arrière, vérifications post-déploiement, blocages externes) ;
  `integration.json` vérifie la présence des neuf sections et l'absence de motif de secret ;
  `workflow-validation.txt`.
- ✅ CA-5 — La page SDD montre les configurations vérifiées, passe axe, vidéo et captures
  desktop/mobile.
  Preuves : `e2e.json` (2 tests `@SPEC-013` réussis, dont `déploiement conforme @SPEC-013 @visual`) ;
  `video/*.webm` (5 vidéos, empreintes SHA-256 dans `summary.md`) ; `screenshots/` (desktop et
  mobile) ; `attachments/*-axe.json` (aucune violation serious/critical) ; `unit.json` et
  `integration.json` valident la page et les données affichées.

## Limites et blocages externes

- Aucun identifiant Vercel, Supabase Cloud ou Inngest Cloud n'est fourni dans le dépôt : les
  workflows réels ne peuvent pas être exécutés et aucune preuve de déploiement distant n'est
  produite. Le blocage est documenté (`docs/operations/deployment.md` §9) et la décision de mise en
  production relève de SPEC-808.
- `act` est absent du poste de validation : seule la validation YAML/actionlint locale est
  exécutée, ce que `workflow-validation.txt` indique explicitement.
- Git LFS est absent : les vidéos restent hors Git avec leur empreinte SHA-256 (ADR-0050).
