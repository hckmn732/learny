---
id: SPEC-111
title: Schéma formations à plusieurs
phase: P1
priority: V1
depends_on: [SPEC-103]
business_rules: [BR-GRP-01, BR-GRP-04, BR-GRP-05]
screens: []
adrs: [ADR-0035, ADR-0246]
visual: demo
---

# SPEC-111 — Schéma formations à plusieurs

## 1. Objectif

Créer les tables d'un groupe lié à une formation partagée, sa liste de membres et la vue limitée de leur progression. Le schéma doit imposer un code d'invitation unique, dix membres au plus et distinguer programme commun et données personnelles de chaque apprenant.

## 2. Contexte

`docs/architecture/data-model.md` §10 et ADR-0035 fixent le modèle : une seule ligne `formations` et des `modules`/`chapters`/`notions` partagés ; cours, apports, tentatives, lacunes et créneaux restent personnels. Lire BR-GRP-01 à 05, `docs/architecture/api.md` §2, SPEC-103, SPEC-102 et les conventions DB/RLS. Les opérations créer/rejoindre/quitter/retirer sont livrées par SPEC-724 ; cette spécification fournit les contraintes, vues et repositories nécessaires.

## 3. Dépendances

- **SPEC-103** : `formations`, programme, progression de module et propriétaire.
- **SPEC-102** : `profiles`, prénom et identité membre ; le profil d'autrui ne doit jamais être exposé au-delà des champs autorisés.
- **SPEC-101** : Drizzle, migrations, fonctions SQL et harnais RLS. SPEC-113 renforcera les politiques transverses.

## 4. Règles métier couvertes

- **BR-GRP-01** : une formation active du propriétaire peut recevoir un groupe, un code `LRN-XXXX` et un lien ; la capacité est dix membres, propriétaire inclus.
- **BR-GRP-04** : chaque membre conserve ses apports, cours, banques, tentatives, lacunes et créneaux, planifiés dans les fenêtres communes du programme.
- **BR-GRP-05** : le membre peut quitter et garder une copie individuelle du programme ; le propriétaire peut retirer un membre, régénérer le code et seul lui peut modifier le programme. Le schéma soutient ces transactions sans partager les lignes personnelles.

## 5. Exigences fonctionnelles

- **EF-1** — `groups` relie une formation unique à son `owner_id`, `invite_code` unique au motif `LRN-[A-Z2-9]{4}`, `max_members=10` par défaut, date de création et `code_rotated_at`. Un propriétaire ne crée pas deux groupes pour la même formation.
- **EF-2** — `group_members` a clé primaire `(group_id,user_id)`, rôle `owner|member`, statut par membre `active|paused|completed`, dates d'entrée/sortie. Le propriétaire est aussi membre et compte dans le maximum de dix.
- **EF-3** — Une opération d'ajout verrouille le groupe et compte les membres actifs dans la transaction ; le onzième est refusé. Le code d'invitation est unique et sa régénération invalide immédiatement l'ancien code.
- **EF-4** — La vue `group_member_progress` ne renvoie que `group_id`, `user_id`, `first_name`, `current_module_position`, `validated_modules` et `streak_days`, pour les membres autorisés. Elle ne retourne jamais note, lacune, apport, cours, discussion, adresse e-mail ni créneau.
- **EF-5** — `countActiveFormations(userId)` additionne formations possédées actives et appartenances `member_status=active` sans compter deux fois une formation dont l'utilisateur est propriétaire et membre. SPEC-618 l'utilise pour la limite de trois.
- **EF-6** — Le repository expose les lectures propriétaire/membre, vérification du code et une transaction de sortie qui laisse le membre dans le groupe jusqu'à ce que SPEC-724 ait créé sa copie personnelle ; un état intermédiaire sans formation est interdit.

## 6. Exigences techniques

- **ET-1** — Colonnes et énumérations de `data-model.md` §10, FK vers `formations` et `profiles`, contraintes `unique(formation_id)`, `unique(invite_code)`, `max_members BETWEEN 2 AND 10` et contrôle de forme du code.
- **ET-2** — Générer le code par tirage cryptographique sur l'alphabet `A-Z2-9`, puis réessayer sur violation d'unicité ; ne jamais dériver le code d'un ID séquentiel. La fonction de génération est testée de manière déterministe via source aléatoire injectée.
- **ET-3** — La vue `group_member_progress` s'exécute avec droits contrôlés, vérifie l'appartenance de l'appelant avant retour et projette explicitement les six colonnes ; aucun `SELECT *` sur `profiles` ou tables personnelles.
- **ET-4** — RLS activée sur `groups` et `group_members` ; propriétaire/membres lisent les informations de groupe nécessaires, seules les opérations du propriétaire modifient code et membres. Le rôle service sert uniquement aux transactions de SPEC-724 prévues.
- **ET-5** — `countActiveFormations` utilise des identifiants de formation distincts et des statuts personnels ; il s'exécute avec le contexte de l'utilisateur, sans élargir la lecture à tous les groupes.
- **ET-6** — Migration Drizzle et copie Supabase identiques ; types exportés depuis `@learny/db`. Les tests insèrent deux formations et plusieurs comptes avec JWT distincts.

## 7. Comportements attendus et cas limites

- **CL-1** — Deux demandes simultanées pour la dixième place : une seule est acceptée ; aucune inscription au-delà de dix.
- **CL-2** — Code déjà utilisé : générer un nouveau code, sans écraser l'autre groupe.
- **CL-3** — Ancien code après rotation : aucune nouvelle adhésion possible.
- **CL-4** — Propriétaire tente de quitter via la sortie membre : refus tant que le groupe existe ; transfert de propriété hors périmètre V1.
- **CL-5** — Membre en pause : reste visible dans la vue du groupe mais n'est pas compté comme formation active.
- **CL-6** — Propriétaire dans `group_members` et `formations` : une seule formation active comptée.
- **CL-7** — Membre A lit les notes ou apports de B par jointure : refus RLS, même si le programme est commun.
- **CL-8** — Suppression d'une formation : groupe/membres supprimés selon FK ; les données personnelles suivent leur propriétaire et la politique de suppression.

## 8. Instructions d'implémentation

1. Définir `groups`/`group_members` et leurs contraintes dans `packages/db/src/schema/groups.ts` ; générer la migration et l'activer sous RLS. Commit `feat(SPEC-111): crée groupes et membres`.
2. Écrire `group_member_progress` et `countActiveFormations` avec contrôle d'appartenance ; tester la projection exacte. Commit `feat(SPEC-111): expose la progression limitée du groupe`.
3. Écrire génération de code, ajout transactionnel, rotation et tests de concurrence/RLS. Commit `test(SPEC-111): vérifie capacité et confidentialité`.
4. Ajouter page SDD, e2e et visuel ; valider et joindre les preuves réelles.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/groups.ts`, `packages/db/src/schema/groups.test.ts`, `packages/db/src/repositories/groups.ts`, `packages/db/src/repositories/invite-code.ts`, `packages/db/migrations/NNNN_groups.sql` et copie Supabase, `packages/db/test/integration/groups.test.ts`, `apps/web/components/sdd-demos/spec-111.tsx`, `apps/web/e2e/specs/p1/spec-111.spec.ts`.
- **Modifiés** : `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`, registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `formations`, `modules`, `module_progress`, `profiles` et `daily_activity`.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-111` montre « Groupe », code factice `LRN-AB23` étiqueté non valide pour une vraie invitation, jauge « 3 / 10 membres », table de progression avec seulement prénom, module, modules validés et série, puis compteur de formations actives. `data-testid` : `spec-111-code`, `spec-111-capacity`, `spec-111-progress`, `spec-111-active-count`. Vérifier par test DOM qu'aucun e-mail, note ou lacune n'y figure, puis jetons, axe et captures desktop/mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — La migration crée les deux tables et le code `LRN-XXXX` unique ; une onzième adhésion concurrente est refusée.
- **CA-2** — La vue projetée ne contient que les six champs autorisés et aucun contenu personnel d'un membre.
- **CA-3** — Le comptage des formations actives ne double pas le propriétaire et respecte le statut personnel d'un membre.
- **CA-4** — Rotation invalide l'ancien code ; RLS interdit à un non-membre l'accès au groupe et aux données personnelles.
- **CA-5** — La page SDD affiche capacité, progression limitée et compteur, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/groups.test.ts`, `describe('[SPEC-111] group schema')` : motif du code, alphabet, bornes, statuts (CA-1, CA-4).
- **Intégration** — `packages/db/test/integration/groups.test.ts`, `describe('[SPEC-111] group persistence')` : migrations, dixième place concurrente, rotation, vue avec projection stricte, comptage sans double et RLS de non-membre (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-111.spec.ts`, `test('inspecte la progression de groupe @SPEC-111')` : voir trois membres sans données privées, conserver la vidéo (CA-5).
- **Visuel** — `test('groupe conforme @SPEC-111 @visual')` : jetons, structure, axe et captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-103]` et tests RLS P1.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration capacité |
| CA-2 | intégration vue/RLS |
| CA-3 | intégration comptage |
| CA-4 | intégration rotation/RLS |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-111/` contient rapports, résultat de concurrence et de projection de vue, tests RLS, vidéo/captures, `checks.json` et `acceptance.md`. Aucun code d'invitation de production n'est conservé.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent. La capacité dix est transactionnelle, la vue n'expose que les champs admis et le nombre de formations actives est correct pour propriétaire et membre.

## 15. Décisions et hypothèses

ADR-0035 fixe le programme commun, les données personnelles privées, dix membres et le code d'invitation. La copie du programme à la sortie est une transaction de SPEC-724 ; ce schéma conserve les clés nécessaires sans effectuer une sortie incomplète.

ADR-0246 consigne les compléments d'implémentation : `member_status` réutilise `formation_status` avec un `check` limité à `active|paused|completed`, la clé étrangère croisée `formations.group_id -> groups` est ajoutée dans la migration personnalisée, la vérification du code et l'adhésion passent par la transaction service de SPEC-724, la vue est en `security definer` avec contrôle d'appartenance, et `count_active_formations` reste borné à `auth.uid()` malgré l'absence de politique de lecture sur `formations` avant SPEC-113. La fabrique de test n'écrit plus `email_confirmed_at`, colonne retirée par GoTrue v2.197.0 : les comptes de test sont créés sans confirmation explicite, ce qui ne change ni le profil ni la RLS.
