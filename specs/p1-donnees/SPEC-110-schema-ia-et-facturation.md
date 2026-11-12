---
id: SPEC-110
title: Schéma IA et facturation
phase: P1
priority: V1
depends_on: [SPEC-102]
business_rules: []
screens: []
adrs: [ADR-0011, ADR-0012, ADR-0245]
visual: demo
---

# SPEC-110 — Schéma IA et facturation

## 1. Objectif

Créer les tables de clés personnelles chiffrées, modèles choisis par tâche, appels IA et abonnements, ainsi qu'un agrégat de dépense du jour dans le fuseau de l'apprenant. Le schéma doit empêcher qu'une clé brute soit persistée ou lue par un autre utilisateur et fournir une base fiable au plafond de coût.

## 2. Contexte

`docs/architecture/data-model.md` §9 fixe les quatre tables et la vue `ai_spend_today`. ADR-0011 définit l'accès gratuit avec sa clé ou l'IA fournie sous abonnement ; ADR-0012 fixe le plafond journalier de 1,50 USD, l'alerte et le repli Haiku. Lire BR-IA-01 à BR-IA-13, `docs/architecture/ai.md` §1, §2 et §6, SPEC-102 pour fuseau/profil et SPEC-101 pour migrations. Chiffrement, qualification, résolution de modèle, Stripe et budget seront ajoutés par SPEC-505/506/507/210.

## 3. Dépendances

- **SPEC-102** : `profiles.id` et `profiles.timezone` ; toutes les lignes portent un `user_id` indexé.
- **SPEC-101** : migrations Drizzle/Supabase, `numeric(12,6)` USD, `userDb` et `withRollback`.
- Aucune clé fournisseur réelle n'est nécessaire aux tests ; les octets de chiffrement de test portent le marqueur `learny-test-only`.

## 4. Règles métier couvertes

Aucune règle `BR-*` n'est attribuée directement dans le catalogue. Les tables soutiennent BR-IA-02/03/06/07/08 : modèles qualifiés, secrets chiffrés, abonnement, plafond et journal, qui seront réalisés par les services correspondants.

## 5. Exigences fonctionnelles

- **EF-1** — `ai_credentials` stocke fournisseur `anthropic|openai|mistral|deepseek|openai_compatible|local`, libellé, URL de base facultative, modèles, `encrypted_key bytea`, quatre derniers caractères, statut `untested|qualified|failed`, rapport de qualification, drapeau `outside_eu` et dates. Aucune colonne de clé en clair n'existe.
- **EF-2** — `ai_task_models` a une ligne par utilisateur/tâche `programme|course|gaps|tutor|light` ; `credential_id=null` signifie IA fournie. Une clé supprimée ou non qualifiée ne doit pas être choisie par le service SPEC-506.
- **EF-3** — `ai_calls` enregistre utilisateur, formation facultative, tâche, fournisseur/modèle, mode géré, tokens entrée/sortie/cache, coût USD, latence, statut `ok|error|refused|capped|invalid_output`, code d'erreur et mode lot. Une ligne est créée même pour un refus ou plafonnement, avec coût nul si aucun appel fournisseur n'a eu lieu.
- **EF-4** — `subscriptions` contient identifiants Stripe, statut `none|active|past_due|canceled|incomplete`, fin de période et `daily_cap_usd` par défaut 1.50. Un statut `active` est la seule base du droit à l'IA fournie ; le service SPEC-210 prendra la décision finale.
- **EF-5** — `ai_spend_today(user_id, spent_usd)` somme seulement les `ai_calls` gérés et réellement facturés du jour civil de l'utilisateur dans son fuseau IANA. Les appels BYOK ne consomment pas le plafond géré. La frontière du jour est évaluée avec l'horloge injectée et des instants UTC.
- **EF-6** — Les types Drizzle et DTO serveur permettent de lister l'usage par jour/formation sans jamais inclure `encrypted_key` dans une réponse client ou dans `toJSON` d'un objet exposé.

## 6. Exigences techniques

- **ET-1** — Colonnes/enum/FK de `data-model.md` §9 ; `cost_usd` et `daily_cap_usd` sont `numeric(12,6)`, tokens/latence non négatifs ; index `ai_calls(user_id, created_at)` et contraintes uniques des identifiants Stripe.
- **ET-2** — `encrypted_key` accepte uniquement les octets chiffrés au format `iv‖tag‖ciphertext` AES-256-GCM ; le chiffrement est implémenté par SPEC-505, mais le repository refuse l'insertion via un champ texte de clé brute.
- **ET-3** — La vue/fonction `ai_spend_today` utilise le fuseau de `profiles` et des bornes UTC équivalentes au début et à la fin du jour local ; ne pas utiliser `date(created_at)` au fuseau serveur. Les tests couvrent minuit et changement d'heure.
- **ET-4** — RLS activée sur les quatre tables dès migration, politiques propriétaire pour les lectures et écritures permises ; écriture des appels et abonnement réservée aux services/jobs autorisés. SPEC-113 audite toutes les politiques.
- **ET-5** — Les vues et objets sérialisables publics exposent seulement `provider`, `label`, `key_last4`, `status` et `outside_eu` pour une clé ; ne jamais exposer `encrypted_key` même sous forme base64.
- **ET-6** — Migration Drizzle copiée à l'identique vers Supabase ; son application et son annulation en base de test sont déterministes.

## 7. Comportements attendus et cas limites

- **CL-1** — Clé personnelle vide (modèle local) : `encrypted_key=null` autorisé selon fournisseur ; pour une clé hébergée, le service exige un chiffré valide.
- **CL-2** — Coût, token ou latence négatifs : refus SQL.
- **CL-3** — Appel BYOK facturé : visible dans l'usage, exclu du plafond d'IA fournie.
- **CL-4** — Deux appels simultanés au plafond : l'agrégat de test conserve les deux coûts ; la réservation atomique sera assurée par SPEC-507.
- **CL-5** — Changement de fuseau : la vue du jour utilise le fuseau actuel du profil pour la lecture ; le journal historique garde l'instant UTC.
- **CL-6** — Minuit local et heure d'été : aucun appel du jour voisin n'est compté par erreur.
- **CL-7** — Suppression d'une clé liée à une tâche : FK `on delete set null` ou rejet transactionnel selon politique de service ; aucune référence pendante.
- **CL-8** — Autre utilisateur lit par UUID : RLS ne rend ni chiffré, ni appel, ni abonnement.

## 8. Instructions d'implémentation

1. Définir les enums et quatre tables Drizzle, contraintes, FK et index dans `packages/db/src/schema/ai-billing.ts`. Commit `feat(SPEC-110): crée les tables IA et abonnement`.
2. Générer/coller la migration Supabase, activer RLS et écrire la vue de dépense locale avec contrôle des permissions. Commit `feat(SPEC-110): migre et agrège la dépense quotidienne`.
3. Créer les types publics expurgés et repositories qui excluent le chiffré ; tester minuit, BYOK et accès croisé. Commit `test(SPEC-110): vérifie coût et secret en base`.
4. Ajouter la démonstration SDD et e2e/visuel ; valider la spécification, renseigner les preuves.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/ai-billing.ts`, `packages/db/src/schema/ai-billing.test.ts`, `packages/db/src/repositories/ai-usage.ts`, `packages/db/migrations/NNNN_ai_billing.sql` et copie Supabase, `packages/db/test/integration/ai-billing.test.ts`, `apps/web/components/sdd-demos/spec-110.tsx`, `apps/web/e2e/specs/p1/spec-110.spec.ts`.
- **Modifiés** : `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`, registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `profiles.timezone`, horloge injectable, ADR-0011/0012 et `data-model.md` §9.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-110` affiche « Modèles et coûts », cartes « Clé personnelle » (libellé/last4/status, jamais chiffré), « Modèle par tâche », « Dépense du jour » et « Abonnement ». `data-testid` : `spec-110-credentials`, `spec-110-tasks`, `spec-110-spend`, `spec-110-subscription`. Le jour de référence est le 11 novembre 2026 à Paris ; montant formaté en USD. La page étiquette les valeurs comme fixtures, ne prétend pas à un paiement réel. Contrôles jetons, structure, axe, captures desktop/mobile à 1 %.

## 11. Critères d'acceptation

- **CA-1** — Les quatre tables et leurs enums/contraintes correspondent au modèle ; aucune clé brute n'est stockable par le repository.
- **CA-2** — La vue de dépense exclut BYOK et les appels non facturés, et respecte le jour local au changement d'heure.
- **CA-3** — Les objets publics ne sérialisent jamais `encrypted_key` ; un second utilisateur ne lit aucune donnée IA/facturation d'autrui.
- **CA-4** — Un abonnement nouveau a le plafond 1,50 USD et les statuts autorisés ; un coût négatif est rejeté.
- **CA-5** — La page SDD présente clés masquées, tâches, dépense et abonnement, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/ai-billing.test.ts`, `describe('[SPEC-110] AI billing schema')` : enums, bornes, projection publique sans chiffré (CA-1, CA-3, CA-4).
- **Intégration** — `packages/db/test/integration/ai-billing.test.ts`, `describe('[SPEC-110] AI billing persistence')` : migrations, coût BYOK/géré, minuit, DST, RLS à deux comptes, secret absent des DTO (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-110.spec.ts`, `test('inspecte les coûts IA @SPEC-110')` : ouvrir la démonstration, vérifier masquage et montant, vidéo (CA-5).
- **Visuel** — `test('coûts IA conformes @SPEC-110 @visual')` : structure, jetons, axe, captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-102]` et tests de schéma P1.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration migration |
| CA-2 | intégration vue |
| CA-3 | unitaires projection ; intégration RLS |
| CA-4 | unitaires ; intégration contraintes |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-110/` contient rapports, résultats SQL de la vue autour de minuit, preuve d'absence du chiffré dans les DTO, tests RLS, vidéo/captures, `checks.json` et `acceptance.md`.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent ; migrations identiques, RLS active, dépense locale correcte et secret absent de toute sortie client. La qualification, le chiffrement et la réservation de budget ne sont pas déclarés réalisés par ce seul schéma.

## 15. Décisions et hypothèses

ADR-0011 fixe BYOK ou abonnement et ADR-0012 le plafond géré. Les tarifs détaillés sont configurés selon ADR-0073 par SPEC-009 ; la vue stocke la dépense réellement journalisée et ne recalcule pas un tarif.

ADR-0245 consigne les compléments d'implémentation : format et redaction du chiffré, répartition des politiques RLS, FK `on delete set null` et garde d'appartenance de la clé, agrégat `ai_spend_today` en fonction/vue `security definer` filtrée par les revendications JWT (le profil n'a pas encore de politique `authenticated`), et identifiants Stripe nuls mais uniques pour un compte gratuit. La réservation atomique du plafond reste livrée par SPEC-507.
