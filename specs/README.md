# Spécifications

Source de vérité de la liste : [`catalog.json`](catalog.json) (identifiant, phase, titre, priorité V1/V2, dépendances, règles métier, écrans, ADR, mode visuel, chemin, périmètre). Les fichiers `SPEC-xxx-*.md` détaillent chaque entrée selon le gabarit [`_template.md`](_template.md) (15 sections obligatoires, vérifiées par `node tools/sdd/audit.mjs`).

## Phases

| Dossier | Phase | Plage | Checkpoint |
|---|---|---|---|
| `p0-fondations/` | Fondations et infrastructure | SPEC-001 → 013 | CP-0 |
| `p1-donnees/` | Base de données, migrations et sécurité | SPEC-101 → 115 | CP-1 |
| `p2-backend/` | Backend, API et services transverses | SPEC-201 → 212 | CP-2 |
| `p3-interface/` | Design system et coquille | SPEC-301 → 309 | CP-3 |
| `p4-moteur/` | Moteur d'apprentissage déterministe | SPEC-401 → 411 | CP-4 |
| `p5-ia/` | IA, ingestion et briques | SPEC-501 → 513 | CP-5 |
| `p6-parcours/` | Parcours d'apprentissage | SPEC-601 → 618 | CP-6 |
| `p7-engagement/` | Révisions, agenda, engagement et réglages | SPEC-701 → 725 | CP-7 |
| `p8-livraison-v1/` | Plateforme, qualité et livraison V1 | SPEC-801 → 808 | CP-8 → v1.0.0 |
| `p9-v2/` | V2 | SPEC-901 → 908 | CP-9 → v2.0.0 |

Critères des checkpoints : [`checkpoints.md`](checkpoints.md).

## Règles

- Une spécification est exécutable quand toutes ses dépendances sont `done` et que le checkpoint de la phase précédente est réussi (`node tools/sdd/next.mjs`).
- Champs obligatoires d'une spécification : identifiant unique, objectif, contexte, dépendances, règles métier couvertes, exigences fonctionnelles (`EF-n`) et techniques (`ET-n`), cas limites (`CL-n`), instructions d'implémentation, fichiers concernés, interface et conformité visuelle, critères d'acceptation mesurables (`CA-n`, au moins 3), plan de tests (`[SPEC-xxx]`, `@SPEC-xxx`, `@visual`), preuves attendues, définition de terminé, décisions.
- Modes visuels (`visual`) : `mockup` (écran maquetté, comparaison avec `design/references/`), `tokens` (écran non maquetté, composé selon `docs/product/screens.md` §3 et vérifié par les jetons), `demo` (capacité sans écran, démontrée par `/_dev/sdd/SPEC-xxx`, ADR-0049).
- Modifier une spécification pendant l'implémentation n'est permis que pour consigner une décision (section 15, avec ADR) ; le périmètre ne change pas (ADR-0005).
- Traçabilité : chaque règle `BR-*` de `docs/product/business-rules.md` est couverte par au moins une spécification (contrôlé par l'audit).
