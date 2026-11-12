# ADR-0260 — enqueue_event : un utilisateur ne met en file que ses propres événements

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-203, ADR-0122, ADR-0035

## Contexte

ADR-0122 impose une fonction security definer enqueue_event accordée à authenticated. Appelable par PostgREST (/rest/v1/rpc), elle permettrait à tout utilisateur connecté de forger un événement (account/deletion-requested pour un autre compte, cron/nightly).

## Décision

enqueue_event borne les appelants authentifiés : p_user_id absent ou égal à auth.uid() (la ligne appartient toujours à l'acteur), data.userId absent ou égal à l'acteur, aucun événement cron/*, nom au format <domaine>/<action>. Un appelant de service (auth.uid() nul : jobs, webhooks, transaction serviceDb) n'est pas borné : un événement dont data.userId désigne un autre utilisateur que l'acteur (ex. retrait d'un membre par le propriétaire) est émis par une transaction de service. La fonction renvoie vrai quand la ligne est créée, faux sur un rejeu. Les tables event_outbox et sdd_demo_runs forcent la RLS comme toutes les tables applicatives.

## Conséquences

La matrice RLS compte 53 tables dont 4 de service. Les spécifications émettrices (SPEC-211, SPEC-724) choisissent le client de transaction selon l'acteur.
