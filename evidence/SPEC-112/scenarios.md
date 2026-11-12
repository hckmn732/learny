# Scénarios vérifiés — SPEC-112

Toutes les valeurs ci-dessous proviennent des fixtures de test et de la démonstration locale
(`2026-11-11T12:20:00Z`, `LLM_MODE=mock`). Aucune donnée personnelle réelle n'est utilisée.

## Recherche privée (CA-3, CA-4)

Jeu : Alex possède une formation « SAP S/4HANA Finance », une notion « Trésorerie prévisionnelle »
et une section courante « Le cycle de trésorerie ». Bob possède les mêmes mots dans une formation
privée. La requête est exécutée via `userDb({ userId })`, donc la fonction `security invoker` et les
politiques RLS s'appliquent.

| Cas | Entrée | Résultat observé |
|---|---|---|
| Accent et casse | `TRÉSORERIE` | formation, notion et section d'Alex ; aucun résultat de Bob |
| Sans accent | `tresorerie` | mêmes identifiants, même ordre |
| Faute courante | `tresoriere` | notion pertinente d'Alex ; aucun résultat de Bob |
| Cours ancien | version 1 non courante | exclue des résultats |
| Section signalée | `reported = true` | exclue des résultats |
| Extrait HTML | contenu `<script>alert(1)</script>… <b>Texte sûr</b>` | extrait `alert(1) La trésorerie suit… Texte sûr`, sans `<`, `>` ni balise |
| Requête vide | `''` ou espaces | zéro ligne |
| Limite | `limit = 0` / `101` | `VALIDATION_FAILED` côté dépôt ; la fonction SQL borne 1..100 |
| Injection | `'; drop table public.formations; --` | zéro ligne, table `formations` toujours présente |
| Apostrophe | `l'argent` | zéro ligne, aucune erreur SQL |

Ordre : `rank desc`, puis `kind` et `id` stables. Les `href` suivent ADR-0046
(`/formations/<fid>`, `/formations/<fid>/programme#notion-<nid>`,
`/formations/<fid>/modules/<mid>/cours?chapitre=<cid>`).

## Idempotence (CA-2, CL-3)

| Cas | Entrée | Résultat observé |
|---|---|---|
| Rejeu identique | même clé, route, paramètres et corps | réponse et code d'origine (`202`), `completed_at` inchangé |
| Autre corps | même clé, `{"format":"json"}` au lieu de `{"format":"zip"}` | `AppError` `IDEMPOTENCY_KEY_REUSED` (422) |
| Autre route | même clé, `/api/v1/deletion` | `IDEMPOTENCY_KEY_REUSED` (422) |
| Traitement en cours | réservation `status_code = 0` non terminée | `IDEMPOTENCY_IN_PROGRESS` (409) |
| Libération | 5xx ou exception | ligne supprimée, nouvelle réservation possible |
| Validité 24 h | clé créée il y a 25 h | traitée comme absente, réservation neuve |
| Concurrence | deux transactions, même clé | une seule ligne ; une transaction termine, l'autre rejoue |
| Bornes SQL | clé courte, empreinte invalide, statut 999, statut 200 sans `completed_at` | `23514` sur la contrainte nommée |

## Quotas (CA-2, CL-4)

Seau `user:<id>:/api/v1/search`, capacité 10. Deux consommations concurrentes de 4 laissent
`tokens = 2` (les restes observés sont 6 puis 2). Une consommation de 3 sur un reste de 2 est
refusée et laisse le seau à 2. Le remboursement (`upsertRateLimit`) et la purge des seaux inactifs
sont couverts par les tests.

## Exports et acceptations (CA-1, CA-4, CL-1, CL-2)

| Cas | Résultat observé |
|---|---|
| Export terminé, échéance future | téléchargeable |
| Export terminé, échéance atteinte | non téléchargeable, ligne toujours lisible |
| Export en attente / échec | aucun lien |
| Échéance antérieure à la création | refus SQL `data_exports_expires_at_check` |
| CGU 1.2 acceptée deux fois | une seule ligne, date d'origine conservée |
| CGU 1.3 puis confidentialité 3.0 | nouvelles lignes, historique trié par date |
| Mise à jour d'une acceptation | refus `legal_acceptance_immutable` |

## Isolation à deux JWT (CA-4)

Sous le JWT d'Alex : un export, une acceptation, zéro clé d'idempotence et zéro seau visibles ; les
lignes de Bob (`data_exports`, `legal_acceptances`, `idempotency_keys`) sont invisibles. Les
écritures d'export, de clé et de seau sont refusées (`42501`) ; l'acceptation de Bob est refusée de
même, alors qu'Alex peut insérer la sienne. La suppression du compte emporte exports, acceptations
et clés ; les seaux, sans FK utilisateur, sont purgés par date (SPEC-208).
