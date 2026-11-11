# ADR-0160 — Accès et reprise de l'onboarding

- **Statut** : Acceptée
- **Origine** : Déduite (décision déjà référencée par SPEC-602)
- **Date** : 2026-11-11
- **Liens** : SPEC-602, SPEC-202

## Contexte

BR-ACC-04 impose les étapes Profil → Rythme → IA → Rappels → Départ, une reprise au bon endroit et l'accès à l'application dès que l'étape IA est franchie. Les invitations de groupe et le passage par Checkout ne doivent pas perdre cette progression.

## Décision

L'étape stockée est monotone : une requête répétée ou ancienne ne fait pas reculer l'onboarding. Le middleware ne redirige vers `/premiers-pas/<étape>` que pendant Profil, Rythme ou IA ; les routes `/premiers-pas/*`, `/legal/*`, `/api/*` et `/_dev/*` restent accessibles selon leurs propres gardes. Une revendication signée `learny_ob`, mise en cache au plus 60 secondes, est invalidée à chaque `PATCH /me/onboarding`. Le Checkout éventuel est lancé après Rappels et le retour mène à Départ. Les trois interrupteurs de rappels correspondent aux colonnes de préférences de SPEC-102. Un modèle personnel sélectionné doit être testé par défaut avant affectation ; la première action de Départ marque l'onboarding terminé. L'accès à l'application à partir de Rappels n'efface pas la possibilité de revenir terminer l'étape Départ.

## Conséquences

Les tests couvrent reprise après fermeture, répétition de requête, retour de Checkout, invitation en attente et expiration/invalidation du cache middleware.
