# ADR-0296 — Contrats d’implémentation du paquet tutor

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l’implémentation, sans sollicitation de l’utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-508

## Contexte

SPEC-508 nomme `llm.generate` alors que le contrat livré par SPEC-504 expose
`llm.session(ctx, { task, promptId }).step(...)`. Elle demande aussi « deux erreurs consécutives »
et « deux corrections » pour une brique invalide, deux formulations qui ne produisent pas le même
nombre de tentatives. Enfin, le journal des livraisons de notifications est en écriture réservée au
rôle service (SPEC-209), alors que les actions du tuteur s’exécutent sous RLS.

## Décision

1. `runTutor` appelle une session SPEC-504 et son `step` avec les dix outils déclarés strictement ;
   le paquet `@learny/tutor` n’importe aucun SDK de fournisseur.
2. Une brique invalide est renvoyée au modèle deux fois (deux corrections). Le troisième échec
   consécutif de la même brique donne `INVALID_OUTPUT`, notifie `ai_task_failed` et exige un choix
   humain ; aucune bascule automatique vers l’IA fournie. Les autres erreurs de validation
   consécutives (outil inconnu, entrée Zod, garde) arrêtent la boucle à la deuxième.
3. `schedule_reminder` crée la notification in-app dans la transaction de l’utilisateur, applique
   les heures calmes et le plafond, mais délègue le journal `notification_deliveries` à SPEC-209
   (rôle service explicitement autorisé).
4. `search_web` et `prepare_question_bank` reçoivent des ports injectés (SPEC-512, SPEC-513) ; sans
   port, l’exécution refuse par `SERVICE_UNAVAILABLE` au lieu d’inventer un résultat.
5. Les consignes Markdown versionnées sont la source de vérité ; un script génère le module TypeScript
   embarqué, et un test vérifie leur identité. Le résultat expose le modèle résolu, jamais
   l’identifiant du modèle simulé.

## Conséquences

Les appelants fournissent `llmDb` (journal `ai_calls`) et `db` (client RLS des actions). Les tests
d’intégration prouvent l’isolation de deux utilisateurs, la transaction d’une brique et
l’idempotence d’un rappel. SPEC-512/513/209 branchent leurs ports sans modifier la boucle.
