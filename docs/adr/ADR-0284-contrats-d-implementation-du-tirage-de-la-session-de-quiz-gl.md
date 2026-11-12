# ADR-0284 — Contrats d’implémentation du tirage de la session de quiz global

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-406, BR-MEM-03, BR-MEM-04, ADR-0015, ADR-0025

## Contexte

SPEC-406 fixe les notions dues, les lacunes en tête, l'entrelacement, le plafond, les formats, les
modes micro et entretien, mais pas la forme exacte des entrées de banque, la traduction d'une nature
de lacune en formats, le calcul de durée ni le sort des notions non jouées. Le moteur doit rester
pur, déterministe et sans import de `packages/config`.

## Décision

1. Les paramètres métier (coût d'une notion, overhead de session, secondes par format, plafond de
   l'entretien) sont une entrée explicite `params`. Les clés de `formatSeconds` définissent les
   formats de quiz valides : les autres briques de la banque sont filtrées.
2. Nature de lacune : oubli → `recall_card` ; confusion → `matching` ou `categorization` ;
   application → `open_question` ; incompréhension → aucun format imposé. La préférence
   (`vary`, `cards`, `matching_categorization`) ordonne les candidats non contraints ; la variation
   retire le dernier format tant qu'un autre candidat reste.
3. Le tri initial est : lacune (confusion > application > incompréhension > oubli), échéance FSRS,
   module, notion. Les blocs « lacunes » et « notions ordinaires » sont entrelacés séparément par
   module, donc toutes les lacunes restent en tête et deux modules identiques ne se suivent pas
   tant qu'un autre module reste disponible.
4. La sélection coupe au premier item qui dépasserait le plafond, calculé comme
   `sessionOverheadSec + Σ formatSeconds[format]`. Les notions suivantes sont reportées à la date
   civile du lendemain ; `estimatedMinutes` vaut 0 pour une session vide.
5. Un module validé contribue toujours ; un module ouvert seulement s'il a déjà été évalué (CL-5).
   L'entretien léger borne le plafond à `maintenanceMaxMinutes` et n'admet que les modules validés.
6. Une banque absente, sans format valide ou sans le format imposé par la lacune produit un rapport
   `exhausted` et un report `awaiting_variant`, jamais un faux item (ET-3). Le dernier format seul
   disponible est réutilisé avec `formatReason = bank_constraint` et `variantRequested = true`.
7. Les doublons de notions, lacunes, banques et derniers formats sont canonisés. Le choix de format
   utilise `stableShuffle` avec la graine, la date et l'identifiant de notion : l'ordre des entrées
   ne change pas le résultat. Aucune échéance FSRS n'est modifiée par le moteur.

## Conséquences

SPEC-411 transmet les paramètres de `ENGINE.globalQuiz` et persiste seulement les items retenus ;
SPEC-513 consomme `exhausted` et `variantRequested`. Les tests vérifient le plafond, les reports,
les formats imposés et l'invariance à l'ordre des entrées.
