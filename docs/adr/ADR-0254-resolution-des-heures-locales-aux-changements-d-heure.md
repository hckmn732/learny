# ADR-0254 — Résolution des heures locales aux changements d'heure

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-207, ADR-0030, ADR-0047

## Contexte

Les crons et les notifications convertissent des heures locales (début de jour, fin des heures calmes) en instants UTC. Un jour local dure 23, 24 ou 25 heures ; une lecture d'horloge peut ne pas exister (printemps) ou exister deux fois (automne). Il faut une règle unique et déterministe (SPEC-207, CL-2, CL-3, EF-6).

## Décision

Les décalages viennent de Intl via @date-fns/tz (tzOffset), jamais d'un nombre d'heures ajouté à UTC. instantsAtLocalTime renvoie toutes les occurrences réelles d'une heure locale : aucune au printemps (rien n'est fabriqué), deux en automne. startOfUserDay prend la première occurrence de minuit, ou l'instant du saut si minuit n'existe pas ; endOfUserDay est le début du jour suivant (intervalle [début, fin[). nextOutsideQuietHours renvoie l'instant courant s'il est autorisé, sinon la première occurrence de la borne de fin strictement postérieure à l'instant ; une borne sautée par l'horloge se résout à l'instant du saut (premier instant réel après la borne). Un jour civil supprimé par un fuseau (Pacific/Apia, 30 décembre 2011) donne un intervalle vide.

## Conséquences

Les résultats sont des instants réels, sérialisables en ISO, identiques quel que soit le fuseau ou la locale du processus. Une plage de moins d'une heure entièrement avalée par un saut d'horloge peut devoir être reportée au jour suivant : nextOutsideQuietHours rejette un candidat encore en heures calmes. Les tests d'intégration comparent le jour et l'heure locaux à ceux de PostgreSQL pour 7 fuseaux.
