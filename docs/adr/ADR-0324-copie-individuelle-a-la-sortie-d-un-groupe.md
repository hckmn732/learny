# ADR-0324 — Copie individuelle à la sortie d’un groupe et notifications de formation à plusieurs

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l’implémentation, sans sollicitation de l’utilisateur)
- **Date** : 2026-11-14
- **Liens** : SPEC-724, SPEC-111, ADR-0035, ADR-0122, ADR-0246

## Contexte

SPEC-724 doit rendre une formation à plusieurs utilisable : création du groupe et du code
`LRN-XXXX`, adhésion par lien ou code, projection limitée des membres, retrait par le propriétaire,
rotation du code et sortie d’un membre avec « copie individuelle de sa formation et historique privé
conservé ». Le schéma de SPEC-111 partage une seule ligne `formations` et son programme ; les données
personnelles sont indexées par `user_id`. Deux points n’étaient pas entièrement tranchés par le texte :
le périmètre exact des lignes déplacées lors d’une sortie, et le rôle utilisé pour écrire les
événements et les notifications quand le propriétaire agit sur un autre membre.

## Décision

1. **La sortie et le retrait s’exécutent dans une transaction avec le client service.** Le membre ne
   peut pas modifier sa propre ligne `group_members` (RLS propriétaire uniquement) et la copie doit
   déplacer des lignes personnelles sans élargir la lecture à autrui. Le service vérifie le rôle, filtre
   chaque écriture sur `user_id`/`owner_id` du membre et ne lit jamais les lignes d’un autre apprenant.
2. **La copie recrée le programme, puis déplace les données personnelles.** Modules, chapitres,
   notions et liens de programme sont recopiés dans une nouvelle formation individuelle. La
   progression de module et de chapitre, les apports et leurs passages, les versions de cours et leurs
   sections, la progression de lecture, les résumés, les états de mémoire, les briques, les activités
   et les créneaux planifiés sont rattachés aux nouvelles entités (mêmes positions). Les jalons, les
   journaux `review_logs` et `gap_events` restent des lignes personnelles append-only : ils ne sont ni
   réécrits ni dupliqués, conformément aux migrations de SPEC-107. Les créneaux déplacés perdent le
   marqueur `group_milestone` ; les fenêtres de modules étant identiques, ils restent dans les fenêtres
   communes.
3. **Les événements de groupe sont écrits après le commit avec un identifiant stable**
   (`group-member-joined:<gid>:<uid>`, `group-member-left:<gid>:<uid>`). Quand le propriétaire retire
   un membre, l’événement porte le `userId` du membre retiré : il est donc enqueué avec le client
   service, seul rôle autorisé par `enqueue_event` à écrire un `userId` différent de `auth.uid()`
   (ADR-0122). Le double envoi reste sans second effet grâce à la clé d’idempotence de la route et à
   l’identifiant stable de l’événement.
4. **Le code d’invitation suit l’alphabet de l’ADR-0035 (`A-Z2-9`).** Le texte ET-4 écrit
   `[A-Z0-9]`, mais l’ADR et le schéma SPEC-111 excluent les caractères ambigus ; les contrats, le
   formulaire et la page utilisent donc `^LRN-[A-Z2-9]{4}$`.
5. **Aucun nouveau type de notification n’est introduit.** Le catalogue de SPEC-209 contient déjà
   `group_invitation` pour une invitation ; les changements d’appartenance sont représentés par les
   événements de groupe et immédiatement visibles sur la page Groupe, sans créer un type de
   notification dont les gabarits, réglages et préférences n’existent pas encore.

## Conséquences

- Une sortie ne laisse jamais un membre sans formation : la copie est créée avant la fermeture de
  l’appartenance, dans la même transaction.
- Les journaux append-only restent privés et consultables par leur propriétaire ; ils ne sont pas
  rattachés à la nouvelle formation, ce qui évite de réécrire une mesure passée.
- Les tests d’intégration vérifient la progression, les apports, la rotation du code et l’unicité de
  l’événement ; les tests unitaires couvrent la projection limitée et les refus.
