# ADR-0246 — Compléments d'implémentation du schéma des formations à plusieurs

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-111, SPEC-724, ADR-0035, ADR-0112, ADR-0113, ADR-0022

## Contexte

SPEC-111 fixe les tables `groups` et `group_members`, le code `LRN-XXXX`, la vue
`group_member_progress` et le comptage des formations actives. Quatre points restaient ouverts à
l'implémentation : (1) `data-model.md` §10 type `member_status` avec `formation_status`, alors que
EF-2 et CL-5 n'autorisent que `active`, `paused` et `completed` ; (2) `formations.group_id` existe
depuis SPEC-103 avec le commentaire « FK ajoutée par SPEC-111 », mais une clé étrangère croisée avec
`groups.formation_id` ne peut pas être exprimée entre deux modules Drizzle sans créer un cycle
d'imports ; (3) un invité qui possède un code n'est pas encore membre, donc la RLS de `groups` lui
interdit de vérifier le code et le rôle service est nécessaire à la transaction d'adhésion de
SPEC-724 ; (4) la vue doit exposer « module en cours » sans jamais lire les tables personnelles
d'un autre membre, et le comptage doit rester dans le contexte de l'utilisateur.

## Décision

1. `group_members.member_status` réutilise l'énumération `formation_status` (data-model §10) avec une
   contrainte `check` qui n'admet que `active`, `paused` et `completed`. Les statuts propres à une
   formation personnelle (`cadrage`, `programme_proposed`, `archived`) restent inutilisables pour
   une appartenance.
2. `groups.formation_id` est unique et référence `formations` en `on delete cascade` ;
   `formations.group_id` reçoit sa clé étrangère vers `groups` en `on delete set null` dans la
   migration personnalisée `groups_rules`, après la création des deux tables. Le cycle est créé dans
   le bon ordre par le repository (formation, puis groupe, puis `formations.group_id`) et la
   suppression d'une formation supprime le groupe et ses membres sans erreur d'ordre de cascade
   (CL-8, vérifié par test).
3. RLS : `groups` est lisible par son propriétaire et ses membres, modifiable par le propriétaire
   seul ; `group_members` est lisible par les membres du groupe et modifiable par le propriétaire
   seul. L'adhésion par code, la rotation et la sortie d'un membre passent par une transaction
   `serviceDb` de SPEC-724 : un porteur de code n'est pas encore membre et la politique ne peut donc
   pas l'autoriser sans élargir la lecture à tous les groupes. Les fonctions `is_group_member` et
   `is_group_owner`, `security definer` avec `search_path = ''`, évitent la récursion des politiques
   sur `group_members` et ne renvoient qu'un booléen pour `auth.uid()`.
4. `group_member_progress` est une vue `security definer` (`security_invoker = false`) dont la clause
   `where` vérifie l'appartenance active de l'appelant. Elle projette exactement six colonnes :
   `group_id`, `user_id`, `first_name`, `current_module_position`, `validated_modules`,
   `streak_days`. Le module en cours est la position du premier module `open` de l'apprenant, sinon
   la plus grande position validée, sinon 1 ; les modules validés sont comptés sur la formation
   partagée et la série vient de `profiles.streak_days`. Aucune table personnelle (notes, lacunes,
   apports, cours, discussions, créneaux) n'est lue.
5. `count_active_formations(p_user_id)` est une fonction `security definer` : tant que SPEC-113 n'a
   pas ajouté de politique de lecture sur `formations`, une fonction `security invoker` ne verrait
   aucune formation possédée et sous-compterait. La fonction refuse un identifiant différent de
   `auth.uid()` lorsque l'appel est authentifié, puis compte l'union des formations possédées
   `active` et des formations rejointes avec `member_status = 'active'` et `left_at is null`. Les
   deux branches filtrent sur `p_user_id` : la lecture n'est jamais élargie aux groupes d'autrui.
   L'union déduplique le propriétaire membre de son propre groupe (CL-6) et une appartenance en
   pause n'est pas comptée (CL-5).
6. La capacité est sérialisée par `select ... for update` sur la ligne `groups` puis par le comptage
   des appartenances dont `left_at is null` : deux demandes simultanées pour la dixième place
   produisent une réussite et un `CONFLICT`, jamais onze membres. Le code est tiré par
   `randomBytes` avec rejet des octets hors plage sur l'alphabet `A-Z2-9` (32 caractères), jamais
   dérivé d'un identifiant ; il est régénéré dans un savepoint sur violation d'unicité
   (`23505`) et sa source aléatoire est injectable pour les tests déterministes.
7. La sortie d'un membre est une transaction : le repository vérifie l'appartenance, refuse le
   propriétaire (CL-4), appelle la fabrique de copie de SPEC-724, vérifie que la copie existe et
   appartient au membre, puis seulement marque `left_at` et `member_status = 'completed'`. Un échec
   de la copie annule tout : aucun état intermédiaire sans formation n'est commité.
8. Des déclencheurs garantissent que l'appartenance du propriétaire porte le rôle `owner`, qu'elle ne
   peut pas être supprimée tant que le groupe existe, et qu'un contrôle différé à la validation
   vérifie la présence de cette appartenance pour chaque groupe.

## Conséquences

Les deux tables, la vue et le compteur respectent `data-model.md` §10 sans exposer de donnée
personnelle. Les transactions de SPEC-724 disposent des primitives verrouillées et testées ; les
lectures propriétaire/membre restent soumises à la RLS. La migration générée `0018_groups` est
complétée par `0019_groups_rules` (clé étrangère croisée, RLS, helpers, vue, compteur,
déclencheurs). SPEC-113 étendra la matrice RLS transversale sans affaiblir ces politiques.
