# ADR-4002 — Application mobile iso web en fonctionnalités

- **Statut** : Acceptée — **remplace ADR-3002**
- **Origine** : Validée (exigence du porteur du projet, 2026-11-24)
- **Date** : 2026-11-24
- **Liens** : ADR-3002, ADR-3001, ADR-3003, ADR-3006, ADR-4001, ADR-4003, SPEC-4003

## Contexte

ADR-3002 faisait de l'application mobile un **compagnon d'apprentissage** : neuf écrans centrés sur le quotidien, et onze parcours renvoyés au web avec « Continuer sur le web ». Ces onze parcours sont : premiers pas (SCR-02), création et cadrage d'une formation (SCR-04), génération, import et ajustement du programme, ajout d'apports (SCR-06 en écriture), exercice pratique (SCR-08), examen blanc (SCR-11), lacunes (SCR-13), carte des notions (SCR-14), bilan final (SCR-16), formations à plusieurs (SCR-17), recherche (SCR-18), clés d'IA personnelles, achat et gestion de l'abonnement.

Le porteur du projet a fixé le 2026-11-24 une exigence contraire : **le mobile doit être iso web en termes de fonctionnalités**.

## Décision

1. **Principe.** Toute fonctionnalité du web existe sur l'application mobile, avec les mêmes règles métier, la même API et les mêmes libellés (`@learny/i18n`). Seule l'ergonomie s'adapte à la plateforme : gestes, feuilles, sélecteurs natifs, appareil photo, partage. Un écart fonctionnel entre le web et le mobile est une anomalie.
2. **Nouvelles fonctionnalités.** À partir de cet ADR, toute fonctionnalité nouvelle est livrée **en même temps** sur le web et sur le mobile. La première est le mode simple (ADR-4003, SPEC-4002 et SPEC-4003).
3. **Rattrapage.** Les parcours exclus par ADR-3002 sont rattrapés dans des phases ultérieures de la piste `mode-simple`, ou d'une piste dédiée. Chaque parcours a sa spécification et sa maquette mobile, construite comme `design/app-mobile/`. Ordre de priorité, du plus utile au quotidien au plus rare :
   1. ajout d'apports et import du programme ;
   2. création et cadrage d'une formation par le tuteur ;
   3. exercice pratique ;
   4. lacunes ;
   5. carte des notions ;
   6. examen blanc ;
   7. bilan final ;
   8. recherche ;
   9. premiers pas ;
   10. clés d'IA personnelles ;
   11. formations à plusieurs ;
   12. abonnement, dans les règles des stores (ADR-3006).
4. **Transition.** Tant qu'un parcours n'est pas rattrapé, son point d'entrée mobile garde le renvoi « Continuer sur le web » défini par ADR-3002 §3. Ce renvoi est une dette suivie, pas un choix de conception.
5. Les règles des stores (ADR-3006) restent prioritaires, notamment pour l'achat d'abonnement et la suppression du compte.

## Conséquences

- ADR-3002 passe au statut « Remplacée par ADR-4002 ». Ses éléments 1 et 4 restent vrais ; les éléments 2 et 3 deviennent transitoires.
- Chaque spécification qui livre une fonctionnalité ajoute un critère d'acceptation de parité : les deux parcours, web et mobile, sont prouvés.
- Le rattrapage représente plus d'une dizaine de spécifications mobiles. Il est planifié après P40.
