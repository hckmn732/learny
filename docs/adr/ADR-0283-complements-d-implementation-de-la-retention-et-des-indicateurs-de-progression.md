# ADR-0283 — Compléments d'implémentation de la rétention et des indicateurs de progression

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-408, BR-MEM-06, BR-PRO-01, ADR-0210, ADR-0047, ADR-0140

## Contexte

SPEC-408 fixe les fenêtres de rétention (± 3 jours autour de J+30 et J+60), l'avancement d'une
formation et les volumes horaires, sans préciser plusieurs détails nécessaires à un résultat
déterministe : unité du taux, signification du champ `eligible`, traitement des lignes dupliquées,
comptage d'un créneau déplacé et frontière entre le moteur pur et le service qui filtre par
apprenant et par formation. ADR-0210 tranche déjà la sélection de la première révision d'une notion
dans une fenêtre.

## Décision

1. **Unité du taux** : `rate` est un pourcentage en double précision dans `0..100` (comme la
   maîtrise de SPEC-403) ; seul l'affichage arrondit. `reviewed = 0` donne `rate = null`, jamais
   `0`.
2. **Dénominateur et éligibilité** : le dénominateur est le nombre de notions distinctes ayant une
   révision sélectionnée dans la fenêtre. `eligible` compte les notions des modules validés dont la
   fenêtre est ouverte à l'instant d'évaluation (jour local ≥ J+(horizon − tolérance)) ; une notion
   éligible sans révision reste hors du dénominateur. `successful` compte les révisions retenues
   réussies.
3. **Sélection et déduplication** : les révisions sont triées par instant, puis identifiant de
   journal, puis notion et résultat ; un identifiant rejoué est ignoré. Pour chaque horizon, la
   première révision de la fenêtre est retenue par notion (ADR-0210). Une notion enseignée par
   plusieurs modules validés est rattachée à la validation la plus ancienne, puis au plus petit
   identifiant de module.
4. **Jours calendaires** : les fenêtres se calculent sur les jours civils du fuseau IANA fourni.
   Le fuseau et les bornes (`ENGINE.retention`) sont des entrées explicites ; `UTC` et les valeurs
   du catalogue sont des replis documentés, jamais des lectures de configuration par le moteur.
5. **Avancement** : `progressPercent = validés / total × 100`, borné `0..100`, sans arrondi.
   `status` vaut `no_modules` sans module, `complete` quand tous les modules sont validés, sinon
   `in_progress`. Une ligne de module dupliquée garde le statut le plus fort
   (`validated` > `open` > `locked`) et n'est comptée qu'une fois.
6. **Heures** : les volumes se déduisent des instants `startsAt`/`endsAt` (durée écoulée exacte en
   millisecondes, divisée par 60 000), donc un changement d'heure ne modifie pas la durée d'un
   créneau. Les statuts `cancelled` et `moved` sont exclus ; tout créneau référencé par le
   `movedFromId` d'un autre est exclu, même si son statut est resté `planned` (CL-5) ; seuls les
   créneaux `done` alimentent les heures faites ; les créneaux `missed` restent prévus.
7. **Notions maîtrisées** : une notion compte si `mastery >= seuil` (80 par défaut, seuil fourni par
   `ENGINE.mastery.threshold`). Un état dupliqué garde la maîtrise maximale. Aucun filtre de lacune
   ou de suspension n'est appliqué : EF-4 ne mentionne que le seuil.
8. **Périmètre apprenant/formation** : le moteur est sans état et n'accepte ni identifiant
   d'apprenant ni état global ; le service de SPEC-411 filtre les lignes par `userId` et
   `formationId` avant composition. Deux appels indépendants ne peuvent donc pas mélanger les
   métriques de deux membres d'un groupe. Aucune fonction d'agrégation multi-utilisateurs n'est
   ajoutée au moteur.

## Conséquences

Les tests de SPEC-408 vérifient les bornes inclusives, la sélection stable, l'absence de `0 %`
trompeur, l'isolation de deux apprenants et l'invariance à l'ordre ou à la répétition des entrées.
Les services doivent transmettre le fuseau, les horizons, la tolérance et le seuil de maîtrise ;
ils restent seuls responsables du filtrage par apprenant et par formation.
