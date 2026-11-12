# ADR-0280 — Durées dérivées et identifiants du planificateur

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-407, ADR-0029, ADR-0047

## Contexte

SPEC-407 fixe l'ordre des activités (apports par chapitre, cours, exercice, quiz, marge), la
capacité quotidienne cumulée et les trois options BR-FOR-14, mais pas la façon de dériver les
durées depuis le volume d'un module ni la forme des identifiants de créneaux calculés. Le
planificateur doit rester pur, déterministe et sans import de `packages/config`.

## Décision

1. Les paramètres métier sont une entrée `PlannerParams` identique à `ENGINE.planner` ; les
   services les transmettent et le moteur ne les importe jamais.
2. La durée d'un module est `hours × 60`. Après le quiz de validation et sa marge fixe, le temps
   restant est réparti : `contributionShare` pour les apports, le reste pour le cours et, si le
   module a un exercice, 30 % de ce reste pour l'exercice. Les apports sont distribués entre les
   chapitres par pas de `granularityMinutes`, le reliquat aux premiers chapitres.
3. Un bloc d'activité ne dépasse pas la plus longue des fenêtres de moments préférés ; au-delà il
   est découpé en blocs consécutifs. Le quiz de validation et sa marge sont d'abord cherchés dans
   une fenêtre contiguë ; si la capacité quotidienne ne le permet pas, la marge est placée au
   premier créneau strictement postérieur au quiz.
4. La capacité quotidienne inclut le quiz global de 30 minutes, réservé à la fin du dernier moment
   préféré ; il n'est émis que pour un jour recevant au moins un autre créneau planifié.
5. Les identifiants des créneaux calculés dérivent de la clé stable
   `formation|module|nature|titre`, jamais de la position dans la sortie. Un créneau manqué rejoué
   reçoit le suffixe `-r<n>` ; les créneaux terminés, manqués et les déplacements manuels valides
   conservent leur identifiant persisté.
6. Les trois options sont calculées par simulation complète, sans mutation : décaler la fin,
   augmenter le volume de 1 en 1 jusqu'à 6 h/jour, alléger le programme par pas de 10 % jusqu'à
   90 %. Une option impossible porte `feasible=false` et sa raison.

## Conséquences

Les services de SPEC-411 reçoivent des durées et des identifiants reproductibles, sans lire la
configuration. Les tests peuvent vérifier les bornes sans dépendre de l'horloge système. Un module
dont le volume est inférieur au quiz plus sa marge reste planifiable : la marge est alors placée
après le quiz sur un autre créneau.
