# ADR-0306 — Contrats d'implémentation du parcours « Premiers pas »

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-602, ADR-0121, ADR-0160, SPEC-506, SPEC-724

## Contexte

SPEC-602 impose une reprise à l'étape enregistrée après connexion, un cache de 60 s de l'étape et
l'invalidation de ce cache à chaque PATCH. SPEC-202 ne redirigeait après connexion que les étapes
`profil`, `rythme` et `ia`. La route `PUT /me/ai/task-models` annoncée comme dépendance de SPEC-506
n'existait pas encore, et la réponse d'acceptation d'invitation appartient à SPEC-724.

## Décision

- Après connexion, toute étape non `done` mène à `/premiers-pas/<étape>`, y compris `rappels` et
  `depart` ; l'accès aux pages applicatives reste ouvert dès `rappels` (ADR-0160).
- Le proxy met l'étape en cache 60 s dans le cookie signé `learny_ob` (HMAC-SHA256 avec
  `APP_ENCRYPTION_KEY`) ; `PATCH /me/onboarding` l'expire immédiatement.
- Le contrat et la route `PUT /api/v1/me/ai/task-models` sont livrés par SPEC-602 faute d'existence
  dans SPEC-506, en réutilisant `assignTaskModel` sans desserrer la qualification.
- La décision de Checkout est calculée côté serveur (`onboardingNeedsCheckout`) et transmise à
  l'étape Rappels ; les trois interrupteurs sont écrits dans le même PATCH que l'étape `depart`.
- L'acceptation d'invitation utilise un schéma local `{ formationId, formationTitle,
  memberFirstNames }` ; SPEC-724 reste propriétaire de la route réelle.

## Conséquences

SPEC-202 voit son test de destination mis à jour pour les étapes `rappels` et `depart`. SPEC-724
réutilise le client et le schéma local sans changer le comportement de la page Départ.
