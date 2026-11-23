# Échecs e2e : mesurés sur `main` et sur la base de la piste

- Date : 2026-11-23
- `main` mesuré : `81a6a7b1` (après fusion de SPEC-2207, SPEC-2301 et de la première tranche de SPEC-2302)
- Base de la piste mesurée : `132596e6` (avant SPEC-2001), worktree temporaire, port 3140
- Base de données remise à zéro avant chaque mesure

## M1 — campagne complète sur `main`

`corepack pnpm test:e2e` (desktop + mobile), lancée 02:28:44Z, arrêtée à 04:02Z après
**402 entrées traitées sur 506** : **184 réussies, 186 en échec, 32 ignorées**. Les 104 entrées
restantes sont les matrices responsives (5 à 6 minutes par cas) et le projet mobile ; elles n'ont
pas été exécutées, la campagne ayant été arrêtée après que la nature des échecs a été établie.

Répartition des 186 échecs : **96 `@visual`** (comparaisons de lignes de base), **72 assertions
fonctionnelles**, **6 délais de 60 s**, 9 autres, 3 sans contexte.

## M2 — mêmes specs sur la base `132596e6`

35 fichiers de spécification couvrant chaque famille d'échec, projet `desktop` :
**96 tests, 42 réussis, 54 en échec, 10 ignorés**.

Comparaison test par test (fichier + titre) : **51 échecs identiques** (donc préexistants),
**16 échecs présents seulement sur `main`**, 3 présents seulement sur la base.

## Familles préexistantes confirmées (51)

- **Captures `@visual`** : lignes de base du 2026-11-12, alors que les polices ont changé sur `main`
  les 2026-11-20 (`ac095e0d`, `f65d13f7`), après ces lignes de base. `git diff 132596e6..HEAD`
  limité à `**/*.css`, aux polices, aux composants et à `__screenshots__` ne montre aucun diff.
  Aucune ligne de base n'a été régénérée (ADR-2001, ADR-2008).
- **Pages de démonstration SDD** dégradées : spec-001 (`status : ok`), spec-006 (défaut d'ADR-2019),
  spec-009, spec-007 visuel, spec-1201 (`sdd-title` absent), spec-1301.
- **Callback d'authentification en 404** (spec-202, `toHaveURL`), spec-211, spec-505
  (`cred-title` en double), spec-510, spec-1103 (compteur Inngest à 0 depuis SPEC-2207),
  spec-102 (`study-line` sans jours), `parametres-hash` (`#abonnement` contre `#modeles`).

## Échecs NON préexistants (16) — à corriger dans le code Python

| Test | Symptôme | Cause identifiée |
|---|---|---|
| `p1/spec-113` RLS | 60 tables / 60 RLS contre 59 / 59 attendus | table `job_deliveries` ajoutée par SPEC-2102 : le compte de la page a légitimement augmenté, la constante du test est antérieure |
| `p0/spec-007` | libellé `devtools.demo_job` au lieu de `sdd-demo-job` | le consommateur Python porte un nom différent de la fonction Inngest ; la page affiche `ownership.yaml` |
| `p2/spec-212` (2 cas) | « Trop petit : une chaîne de 2 caractères… » au lieu de « Saisissez au moins 2 caractères. » | **régression réelle** : le message de validation Pydantic fuit au lieu du texte Zod copié dans `locale_fr/validation.py` |
| `p20/spec-2001` | le bloc compteurs ne contient plus « 49 » | catalogue à 50 événements avec `job/daily-digest` (SPEC-2207) : constante du test antérieure |
| `p1/spec-115` | `toBe(true)` reçu `false` | données de démonstration |
| `p6/course-generation` (3), `course-reading` (2), `gaps` (2), `notion-graph` (2) | `course-article` et éléments absents après 30 s | **régression réelle** : la génération de cours n'est pas exécutée (chaîne `chapter/contributions-completed` → `tutor.generate_course`) |
| `p7/global-quiz` (2) | `gq-header` absent, écran de fin en 500 | à qualifier |
| `p7/micro-session` (2) | lien direct, retour à la séance complète | à qualifier |

Les cas `spec-007`, `spec-113`, `spec-115`, `spec-212`, `spec-2001` et `global-quiz` ont été
reproduits isolément sur `main` avec une base neuve : ils sont déterministes.

## Conclusion

L'exception « échecs préexistants » ne couvre pas les 16 cas ci-dessus. CP-21 et CP-22 ne peuvent
donc pas être passés avec exception en l'état : ils sont enregistrés en échec, et les 16 cas sont
la dette à traiter avant de les relancer.
