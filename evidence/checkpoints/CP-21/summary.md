# Checkpoint CP-21 — Migration Python — données, identité et worker

- Date : 2026-11-23T04:38:27.000Z
- Résultat : ❌ échec
- Spécifications de la phase : SPEC-2101, SPEC-2102

| Contrôle | Résultat |
|---|---|
| audit | ✅ |
| lint | ✅ |
| typecheck | ✅ |
| build | ✅ |
| unit | ✅ |
| integration | ✅ |
| e2e (non-régression complète) | ❌ 184 réussis / 186 échecs sur 402 entrées exécutées |

## Exception

Le checkpoint n'est **pas** passé avec exception. La mesure de référence
(`evidence/checkpoints/preexisting-e2e-failures.md`) distingue :

- **51 échecs préexistants** (captures `@visual` dont les lignes de base datent du 2026-11-12 alors
  que les polices ont changé sur `main` le 2026-11-20, pages de démonstration déjà dégradées,
  callback d'authentification, `parametres-hash`), donc couverts par ADR-2019 et le précédent CP-20 ;
- **16 échecs non préexistants**, dont deux régressions réelles à corriger dans le code Python :
  le message de validation Pydantic qui fuit au lieu du texte Zod de `locale_fr/validation.py`
  (`spec-212`) et la génération de cours qui n'est pas exécutée (`course-generation`,
  `course-reading`, `gaps`, `notion-graph`). Les autres sont des constantes de test antérieures
  à une croissance légitime de l'inventaire (`spec-113` : 60 tables avec `job_deliveries` ;
  `spec-007` : nom du consommateur Python ; `spec-2001` : 50 événements).

Aucune assertion d'oracle n'a été modifiée, aucune ligne de base régénérée (ADR-2001, ADR-2008).
Les 16 cas sont la dette à traiter avant de relancer ce checkpoint.
