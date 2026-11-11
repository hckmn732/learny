# ADR-0190 — Contrat des automatismes sur le moteur

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-711, SPEC-712, SPEC-713, SPEC-714, SPEC-715, SPEC-716, SPEC-717, SPEC-718, SPEC-719, SPEC-720, SPEC-721, SPEC-722

## Contexte

Les dix automatismes (SPEC-712 à SPEC-721) et la carte d'accueil (SPEC-722) reposent sur le moteur `@learny/automations` (SPEC-711), rédigé en parallèle. Il faut un contrat unique, stable et vérifiable pour que chaque automatisme soit implémentable sans interprétation : forme de la définition, cycle de vie d'une action, idempotence, explication, annulation, consommation.

## Décision

1. Chaque automatisme est déclaré par `defineAutomation({ key, triggers, params, run, explain, undo, apply? })` dans `packages/automations/src/definitions/<key>.ts` et enregistré dans `packages/automations/src/registry.ts`.
   - `key` : valeur de l'énumération `automation_key` (`reprise|micro_seance|echauffement|remediation|jeu_lacune|questions_cartes|plafond_quiz|sprint|bilan|pause`).
   - `triggers` : liste de `{ type: 'event', name: '<événement Inngest>' }` ou `{ type: 'hourly', localHour: number | ((params) => number) }` (tick `cron/hourly-tick`, ADR-0067) ou `{ type: 'nightly' }` ou `{ type: 'direct' }` (appel synchrone par un service, ex. tirage de session).
   - `params` : schéma Zod exporté par `packages/contracts/src/automations.ts` (valeurs par défaut de BR-AUT-*).
   - `run(ctx, trigger) → Promise<ActionDraft[]>` : fonction sans effet de bord sur le domaine ; elle lit l'état et renvoie des brouillons `{ kind, formationId: string|null, requiresConsent: boolean, payload, undoPayload?, dedupeKey, notification?: { type, href, expiresAt? }, expiresAt? }`.
   - `apply(ctx, action) → Promise<Result<{ payload?, undoPayload? }, AppError>>` (facultatif) : applique l'effet dans la transaction du moteur ; appelé immédiatement pour une action sans accord, au moment de l'accord sinon.
   - `explain(action, tone, timeZone) → string` : une ligne (≤ 160 caractères), au ton de l'utilisateur (`vous|tu`), sans point final si elle se termine par une heure ; elle alimente `automation_actions.summary`, le journal (BR-AUT-12) et la carte d'accueil.
   - `undo(ctx, action) → Promise<Result<void, AppError>>` : annule l'effet ; renvoie `AUTOMATION_ACTION_CONSUMED` si l'action est consommée.
2. Le moteur (SPEC-711) garantit, pour tous : vérification de `automation_settings.enabled` et des paramètres validés ; suspension pendant une pause globale active (sauf la clé `pause`) ; idempotence par `(user_id, automation, payload.dedupeKey)` (index unique partiel `automation_actions_dedupe_uq` sur `(user_id, automation, (payload->>'dedupeKey')) where payload ? 'dedupeKey'`) ; calcul de `summary` par `explain` ; statut initial `pending_consent` si `requiresConsent`, sinon appel de `apply` puis `applied` ; émission de `automation/action-proposed|-applied|-undone` ; notification par `notify()` (SPEC-209 : heures calmes, plafond, déduplication) ; expiration (`expiresAt` dépassé → `expired`) par le tick horaire ; routes `GET /me/automation-actions` (filtres `status`, `kind`, `automation`, `formationId`, `since`, `limit`, `cursor`) et `POST /me/automation-actions/:id/(accept|decline|undo)` ; fonction `markConsumed(tx, actionId)` appelée par le code du domaine quand l'effet a été utilisé (statut `consumed`, annulation impossible).
3. Le corps de `POST /me/automation-actions/:id/accept` accepte un champ facultatif `choice` (objet libre validé par le schéma propre au `kind`, ex. `{ startsAt }` pour un autre créneau) transmis à `apply` dans `action.payload.choice`.
4. Les types d'actions (`kind`) sont des chaînes `snake_case` déclarées dans `packages/contracts/src/automations.ts` (`AUTOMATION_ACTION_KINDS`) ; chaque spécification d'automatisme fixe les siens.
5. Règle de résolution : si le moteur livré par SPEC-711 nomme différemment un élément ci-dessus, **les noms de SPEC-711 font foi** et les comportements décrits ici restent normatifs ; s'il manque un élément (crochet `apply`, filtre de liste, champ `choice`, index d'idempotence, `markConsumed`), la première spécification 712 à 722 exécutée qui en a besoin l'ajoute dans `packages/automations` (migration comprise) sans changer le comportement existant, et le signale dans son rapport ; les suivantes le réutilisent.

## Conséquences

Les spécifications 712 à 722 décrivent uniquement leurs déclencheurs, paramètres, brouillons, effets, explications et annulations. Les tests d'intégration exécutent les définitions directement (`runAutomation(key, userId, trigger)`) avec horloge avancée pas à pas.
