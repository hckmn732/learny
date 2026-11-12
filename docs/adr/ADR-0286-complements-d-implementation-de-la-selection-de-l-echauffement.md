# ADR-0286 — Compléments d’implémentation de la sélection de l’échauffement

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l’implémentation, sans sollicitation de l’utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-410, SPEC-714, ADR-0148, ADR-0140, ADR-0047

## Contexte

ADR-0148 fixe le sens des liens `prerequisite`, la définition de « la veille » (jour local le plus récent, au plus 7 jours avant) et l’ordre de priorité (meilleur prérequis puis meilleure notion de la veille, complément par rétrievabilité croissante, maîtrise croissante, identifiant). SPEC-410 ET-1 impose une fonction pure à entrée explicite avec une graine, ET-3 un tri canonique avant le tirage et EF-4 une variété à seed identique. Il restait à préciser la projection d’entrée, la source de la rétrievabilité et l’articulation entre l’ordre canonique et le tirage.

## Décision

1. `seenNotions` est la projection complète des notions de la formation (y compris jamais vues, `lastSeenOn: null`) : `notionId`, `formationId`, `chapterId`, `lastSeenOn` (jour civil local), `suspended`, `mastery` (deux décimales, SPEC-403) et `retrievability` (0..1 au moment de la séance, SPEC-402).
2. Les liens sont lus `fromNotionId` (origine/prérequis) vers `toNotionId` (cible) sur un seul niveau ; seules les cibles du chapitre à venir comptent. Les origines jamais vues, suspendues, hors formation, d’un chapitre inaccessible ou appartenant au chapitre à venir sont exclues.
3. La veille suit ADR-0148 avec `lookbackDays = 7` (miroir de `ENGINE.warmup.yesterdayLookbackDays`) ; `localDate` est fourni par le service, calculé dans le fuseau du profil.
4. Les deux choix prioritaires d’ADR-0148 sont déterministes ; le tri canonique (rétrievabilité croissante, maîtrise croissante, identifiant) précède un mélange stable à graine des candidates restantes, ce qui satisfait EF-4 sans dépendre de l’ordre d’entrée. En cas de double appartenance, la raison `yesterday` l’emporte (CL-4).
5. `DEFAULT_WARMUP_PARAMS` reproduit `ENGINE.warmup` ; `count` hors de `allowedCounts` et `defaultCount` hors liste sont refusés par `INVALID_PARAM`.
6. `warmupCandidates` expose le jour de référence et les ensembles triés pour l’explication de SPEC-714 et la démonstration, sans effet de bord.

## Conséquences

SPEC-714 consomme `selectWarmup` et `warmupCandidates` sans recalculer les filtres. Le moteur ne met jamais à jour FSRS ni ne persiste une réponse ; les services transmettent les paramètres et les dates locales. Toute évolution de la définition de la veille reste confinée à `params.lookbackDays`.
