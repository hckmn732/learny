# Feuille de route SDD — une spécification de migration

La migration vers une API Python headless est suivie dans **une seule spécification SDD**, [SPEC-MIGRATION](../../../specs/p-migration/SPEC-MIGRATION-api-python-headless.md). Ses lots sont des jalons internes exécutés et prouvés dans l'ordre; ils ne deviennent pas des sous-spécifications.

## Lots internes

| Lot | Objet | Sortie / gate |
|---|---|---|
| 0 | Réconciliation de l'état du dépôt, inventaires routes/jobs/RLS/tests et décisions d'architecture | Baselines vérifiées et ADR enregistrés avant code contradictoire |
| 1 | Socle Python, contrat OpenAPI, SDK TypeScript, CI, erreurs et observabilité | Build reproductible et contrôle de compatibilité |
| 2 | Connexion à Auth, PostgreSQL/RLS, Storage, relais web et transactions | Matrice d'isolation et intégrations locales prouvées |
| 3 | Services applicatifs structurés en domaines, ports et workers communs | Verticaux métier avec oracles et tests de domaine |
| 4 | Migration des routes, événements et jobs par lots métier | Parité sans divergence inexpliquée, un écrivain |
| 5 | Raccordement des clients et cutover progressif | Parcours web/Bearer, arrêt et rollback exercés |
| 6 | Validation complète, restauration, retrait runtime historique | Tous les CA, preuves, runbooks et CP-MIGRATION verts |

La séquence couvre architecture, connexion, migration par lots, tests, cutover, rollback et retrait. Chaque lot est commité et documenté sous `SPEC-MIGRATION`; la spécification n'est terminée qu'après validation complète et checkpoint CP-MIGRATION.

## Dépendances et relation avec l'ancien SDD

Le catalogue donne à `SPEC-MIGRATION` une piste dédiée depuis `main`, activée après CP-8. P10–P13 et leurs ADR Hono restent conservés pour l'historique et doivent être réconciliés par le lot 0. Ils ne sont pas fusionnés ni effacés par cette mise à jour et ne sont pas démarrés en parallèle du portage Python. Les ADR existants gardent priorité jusqu'à leur remplacement explicite par les nouveaux ADR de décision.

Le catalogue, l'outil d'audit et les règles de commit acceptent l'identifiant nommé `SPEC-MIGRATION` et le checkpoint `CP-MIGRATION`. Les états `progress/state.json` restent gérés par les outils SDD; ce document ne prétend pas que la migration a commencé, a été validée ou est terminée.
