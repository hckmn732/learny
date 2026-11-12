# ADR-0239 — Version courante à l'insertion et cohérence propriétaire pendant les cascades

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-105, ADR-0039, ADR-0112, ADR-0113

## Contexte

SPEC-105 ET-3 demande un déclencheur before insert or update of is_current qui bascule les autres versions, tandis que CL-2 attend qu'une mise à jour forcée de deux lignes à is_current = true dans la même instruction soit refusée par l'index partiel unique (23505). Un déclencheur qui bascule aussi à la mise à jour résout silencieusement cette instruction et empêche le 23505 ; les deux exigences ne peuvent pas être satisfaites simultanément. Par ailleurs, la fonction générique de cohérence propriétaire s'exécute aussi sur les mises à jour déclenchées par les clés étrangères en cascade (set null) et ne doit pas échouer quand le parent a déjà disparu.

## Décision

Le déclencheur courses_single_current reste déclaré before insert or update of is_current when (new.is_current) mais ne bascule les autres versions qu'à l'insertion ; les EF-1, CL-1 et la création de versions par les services (SPEC-608) passent par des insertions. Une promotion explicite de deux lignes dans la même instruction est refusée par courses_one_current_idx (23505, CL-2) ; un service qui remet une ancienne version courante démarque d'abord la version courante. La fonction assert_same_owner() ignore un parent absent (cascade en cours) et ne refuse que les incohérences entre lignes existantes (owner_mismatch, 23514) ; les clés étrangères conservent la vérification d'existence.

## Conséquences

Le comportement de EF-1 et CL-2 est conservé sans affaiblir les tests. Les services de promotion doivent démander explicitement la bascule. Les cascades de suppression ne sont pas bloquées par la cohérence propriétaire.
