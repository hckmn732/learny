# SPEC-114 — critères d'acceptation

Spec : `specs/p1-donnees/SPEC-114-stockage-des-fichiers.md` — validation du 2026-11-12.
Preuves : `evidence/SPEC-114/` (unit.json, integration.json, e2e.json, e2e.xml, checks.json, vidéos, captures, rapports axe). Aucun jeton ni nom d'apport privé n'est reproduit ici.

- ✅ CA-1 — Les deux buckets sont privés et une lecture anonyme échoue. Preuve : `test/intégration` `[SPEC-114] Storage isolation > keeps both buckets private and refuses anonymous reads` lit `storage.buckets` (`exports` et `resources` avec `public = false`), vérifie qu'aucune politique Storage n'accorde un rôle `anon`, charge un objet réel puis constate l'échec d'un GET anonyme et l'absence du chemin dans une liste anonyme. Détail dans `integration.json`.
- ✅ CA-2 — Un propriétaire obtient des URL d'envoi/lecture de dix minutes ; un chemin invalide est refusé. Preuve : 12 tests unitaires `[SPEC-114] storage paths` (chemin `<userId>/<uuid>/<nom>`, nom nettoyé, refus de `../`, `..\`, `%2F`, `%5C`, `%00`, `%2e%2e%2f`, nom vide, préfixe étranger), expiration exacte `2026-11-11T12:20:00Z → 12:30:00Z`, jeton d'envoi local dont `exp − iat = 600 s` ; test d'intégration `signs upload and read URLs for A…` qui envoie et relit réellement l'objet avec A, et `rejects invalid paths before signing…` qui refuse le chemin encodé avant toute signature.
- ✅ CA-3 — Le compte B, même membre du groupe, ne liste, lit, écrit ni supprime les objets A. Preuve : `[SPEC-114] Storage isolation > signs upload and read URLs for A, and B never reads, lists, writes or deletes` crée B puis le fait rejoindre le groupe de A (`joinGroup`), constate une liste vide sous le préfixe de A, un refus `FORBIDDEN` de signature, un GET direct refusé avec le JWT réel de B, une écriture directe refusée, un `UPDATE storage.objects` à zéro ligne et l'objet de A toujours présent après la tentative de suppression de B. Matrice mesurée : propriétaire autorisé, autre membre refusé, anonyme refusé.
- ✅ CA-4 — Une URL expirée est rejetée, et une ligne DB supprimée ne permet plus de signer une lecture. Preuve : `expires real signatures, tolerates a missing blob and invalidates deleted rows` obtient une URL de lecture courte, la lit avec succès, attend 1,5 s puis constate le rejet par Storage ; après suppression de la ligne `resources`, toute signature de lecture renvoie `NOT_FOUND` bien que le blob existe encore, puis le rôle de service nettoie l'orphelin. Le test des exports constate aussi `NOT_FOUND` pour un export expiré. L'unité fige l'expiration exacte à dix minutes.
- ✅ CA-5 — La page SDD affiche buckets, chemin, TTL et matrice, passe axe, vidéo et captures desktop/mobile. Preuve : e2e `inspecte le stockage privé @SPEC-114` (ordre `spec-114-buckets`, `spec-114-path`, `spec-114-ttl`, `spec-114-access`, deux badges « Privé », chemin factice à trois segments, « URL signée : 10 min », aucune URL réelle) ; `stockage conforme @SPEC-114 @visual @mobile` sur desktop et mobile avec `@axe-core/playwright` sans violation serious/critical, captures `screenshots/`, comparaisons `visual/`, 6 vidéos dans `video/` et captures de référence `apps/web/e2e/__screenshots__/p1/spec-114.spec.ts/`.

## Matrice d'accès mesurée

| Opération | Propriétaire | Autre membre | Anonyme |
|---|---|---|---|
| Lister les objets du préfixe | autorisé | refusé | refusé |
| Obtenir une URL d'envoi | autorisé | refusé | refusé |
| Signer une lecture | autorisé | refusé | refusé |
| Supprimer un objet | autorisé | refusé | refusé |
| Lire un export personnel | autorisé | refusé | refusé |

## État réel des buckets

| Bucket | Public | Limite | Politiques authentifiées |
|---|---|---|---|
| `resources` | non | 50 Mio | SELECT, INSERT, UPDATE, DELETE sous `<auth.uid()>/<uuid>/<nom>` |
| `exports` | non | 2 Gio | SELECT, DELETE du propriétaire ; écriture réservée au rôle de service |

## Validations

`lint`, `typecheck`, `build`, `unit` (12 tests `[SPEC-114]`), `integration` (5 tests `[SPEC-114]`), `e2e` (3 tests, 6 vidéos), `visual` (2 tests `@visual`, mode demo) : réussis. Voir `checks.json`.
