# ADR-0172 — Chronomètre serveur et reprise de l'examen blanc

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-614

## Contexte

ADR-0028 fixe un chronomètre de référence côté serveur (`attempts.deadline_at`) et la soumission automatique à échéance ; il faut préciser la tolérance, la reprise et le cas hors ligne.

## Décision

1. À la création : `started_at = clock.now()`, `deadline_at = started_at + durationMin`. Chaque réponse de l'API porte `serverTime` ; le client affiche `deadline_at − (serverTime + temps écoulé localement depuis la réception)`.
2. Une écriture de réponse reçue après `deadline_at + 5 s` (tolérance réseau) est refusée (409 `EXAM_TIME_OVER`) ; entre `deadline_at` et `deadline_at + 5 s`, elle est acceptée.
3. Soumission automatique, par trois voies idempotentes : (a) le client appelle `submit` à 00:00 ; (b) la fonction Inngest `exam-deadline` (`step.sleepUntil(deadline_at + 5 s)`) soumet la tentative si elle est encore `in_progress` ; (c) toute lecture d'une tentative `in_progress` dont l'échéance + 5 s est dépassée la soumet d'abord (soumission paresseuse). Statut `timed_out` pour (b) et (c), `submitted` pour (a) et la fin volontaire ; toutes passent ensuite à `graded`.
4. Rouvrir la page reprend la tentative `in_progress` (réponses, marquages, dernière question vue) avec le temps restant réel ; le temps passé hors de la page n'est jamais restitué.
5. Une seule tentative `in_progress` d'examen blanc par formation et par apprenant ; une nouvelle demande reprend celle-ci.

## Conséquences

Des réponses saisies hors ligne et non envoyées avant `deadline_at + 5 s` sont perdues ; l'interface en avertit.
