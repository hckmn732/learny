# SPEC-212 — critères d'acceptation

Mesures du 2026-11-12 sur la pile Supabase locale et la base réelle (`pnpm db:reset` + jeu de
démonstration SPEC-115), horloge figée au 2026-11-11T12:20:00Z (ADR-0047), IA non sollicitée
(`LLM_MODE=mock`). La fonction SQL `search_user_content` s'exécute sous le JWT de chaque apprenant
(`security invoker`, RLS active). Preuves : `unit.json` (32 tests `[SPEC-212]`), `integration.json`
(10 tests `[SPEC-212]`), `e2e.json` et les sept vidéos de `video/`, les captures et comparaisons de
`screenshots/`, et les mesures écrites par les tests dans `proofs/` (réponses JSON, plan `EXPLAIN`,
journal, isolation, performance). Aucune maquette n'a été modifiée.

- ✅ **CA-1** — Les requêtes de moins de 2 ou plus de 100 caractères normalisés sont refusées `400`
  sans appel SQL ; les autres renvoient la structure groupée dans l'ordre Notions, Chapitres,
  Formations.
  Preuve : unitaires `[SPEC-212] normalisation et surlignage › normalisation de la requête` « refuse une
  requête de moins de 2 caractères normalisés », « accepte exactement 2 et 100 caractères, refuse 101
  après normalisation (CL-9) », « refuse sans appel SQL une requête hors bornes (CL-1) » (le faux client
  de base lève s'il est appelé) et « limite par groupe : 5 par défaut, de 1 à 20 ». Intégration
  `[SPEC-212] API de recherche › CA-1 — structure groupée dans l’ordre Notions, Chapitres, Formations,
  sans appel SQL hors bornes` : `query: "reseau"`, groupes `notion`, `chapter`, `formation` dans cet
  ordre, libellés « Notions », « Chapitres », « Formations », `limit` par défaut 5 et `total` avant
  coupe ; `q=a`, `q="  a  "`, `q` de 101 caractères et `limit` 0/21/abc → `400 VALIDATION_FAILED` avec
  les messages « Saisissez au moins 2 caractères. » et « Recherche limitée à 100 caractères. ». E2E
  `@SPEC-212 › parcourt la route réelle` vérifie les mêmes refus sur la route réelle (problem+json,
  `errors[0] = { path: "query.q", message }`). Preuves : `unit.json`, `integration.json`,
  `proofs/response-reseau.json`.
- ✅ **CA-2** — Casse et accents n'influent pas sur les résultats ; une faute courante retrouve la
  notion attendue.
  Preuve : unitaires `repli des accents et de la casse` « replie les accents, les cédilles et la casse »
  et « est insensible à la forme de normalisation Unicode » (NFC/NFD/NFKC), `positions de surlignage`
  « donne les mêmes positions relatives pour Réseau, reseau et RESEAU (CL-2) ». Intégration
  `CA-2 / CL-2 — casse et accents sans effet, mêmes positions relatives` : `Réseau`, `reseau` et
  `RESEAU` renvoient les mêmes identifiants, titres et positions ; `CA-2 / CL-3 — une faute courante
  retrouve la notion, avec un rang inférieur` : `reseua` retrouve « Réseau local » avec un rang
  strictement inférieur à la correspondance exacte. E2E `recherche groupée` : « RÉSEAU » donne les
  mêmes titres que « reseau », « reseua » affiche « Réseau local » ; `proofs/response-reseua.json`.
- ✅ **CA-3** — Aucun résultat d'un autre utilisateur, d'un cours non courant ou d'une section
  signalée ; aucune injection SQL possible.
  Preuve : intégration `CA-3 / CL-4 — aucun résultat d’un autre apprenant, mêmes réponses avec ou sans
  lui` (deux JWT, contenus recoupés : `aliceItems` 5, `bobItems` 4, `shared` 0, aucun mot de Bob dans
  la réponse d'Alice, réponse d'Alice inchangée après création de Bob — `proofs/isolation.json`),
  `CA-3 / CL-6 — ni cours ancien ni section signalée` (section d'une version antérieure et section
  `reported` absentes) et `CA-3 / CL-5 — injection SQL, guillemets et jokers traités comme du texte`
  (`'; drop table public.formations; --`, `" OR ""="`, `' OR 1=1 --`, `%`, `_`, `\\`, `1) union select
  id from auth.users --` : `200`, `groups: []`, table `formations` toujours présente, 3 notions
  intactes, recherche suivante fonctionnelle). E2E `parcourt la route réelle` : la réponse d'Alice ne
  contient pas « Bob » et celle de Bob ne contient pas « Réseau local » ; l'injection renvoie `200` et
  `groups: []`.
- ✅ **CA-4** — Les extraits sont du texte brut ≤ 160 caractères, les positions de surlignage
  correspondent exactement aux occurrences, aucun HTML ne sort de l'API.
  Preuve : unitaires `nettoyage des extraits` (balises, scripts, commentaires, entités retirés ;
  Markdown aplati ; aucun chevron, même isolé) et `extraits de 160 caractères au plus` (coupe avec
  ellipses, recentrage sur une correspondance au-delà du 160ᵉ caractère, paires de substitution et
  séquences combinantes jamais coupées, sortie NFC). Intégration `CA-4 / CL-7 / CL-8 — extraits en
  texte brut, surlignage exact, aucun HTML` : chaque `snippet` ≤ 160 caractères, plages croissantes et
  dans le texte, chaque portion couverte se replie en « reseau », aucune occurrence laissée sans
  surlignage, section HTML rendue en « Un réseau relie des machines. Texte sûr a b » (aucun `<` ni
  `>` dans la réponse JSON), section longue commençant et finissant par « … » autour de « Le réseau en
  étoile » (`proofs/response-snippets.json`). E2E `recherche groupée` : le HTML rendu de la page ne
  contient ni `&lt;` ni `<script` et le `<mark>` du titre vaut « Réseau ».
- ✅ **CA-5** — p95 ≤ 150 ms sur le jeu substantiel, index utilisés, texte de requête absent des
  journaux.
  Preuve : intégration `CA-5 — p95 ≤ 150 ms sur le jeu substantiel, index disponibles pour le plan`
  sur 10 formations, 2 000 notions et 500 sections (`ANALYZE` puis 10 requêtes d'échauffement et 60
  mesures) : p95 **89,8 ms**, p50 75 ms, max 94 ms, seuil 150 ms (`proofs/performance.json`). Le plan
  `EXPLAIN` consigne le plan naturel sous RLS (filtre propriétaire avant le prédicat) et, comme
  SPEC-112, l'usage effectif des index `notions_fts_idx`, `course_sections_search_fts_idx`,
  `formations_search_fts_idx`, `notions_search_label_trgm_idx`,
  `course_sections_search_title_trgm_idx` et `formations_search_title_trgm_idx`
  (`proofs/explain.md`, assertions sur chaque nom d'index). `ET-5 — seuls la longueur de la requête et
  le nombre de résultats sont journalisés` : le journal contient `queryLength: 12`, `resultCount: 5`
  et ne contient ni « réseau », ni « local », ni « zéphyrine » (`proofs/logs.json`). E2E et intégration
  vérifient en plus `Cache-Control: no-store` et la référence de requête.
- ✅ **CA-6** — La page SDD démontre les requêtes d'exemple ; vidéo, axe et captures ≤ 1 %.
  Preuve : e2e `@SPEC-212 › recherche groupée` sur `/_dev/sdd/SPEC-212` : `h1` attendu, régions
  `spec-212-query`, `spec-212-results` (`aria-live="polite"`), `spec-212-json`, champ de recherche
  étiqueté, cinq puces « reseau » (sans accent), « RÉSEAU » (casse), « reseua » (faute), « a »
  (refusée) et « ' OR 1=1 -- » (traitée comme texte) ; groupes Notions/Chapitres/Formations avec
  `<mark>`, message « Aucun résultat pour « ' OR 1=1 -- ». », alerte `role="alert"` pour « a », JSON
  repliable, navigation clavier ; `axeCheck()` sans violation. `recherche conforme @visual @mobile`
  vérifie les jetons de base, l'absence de débordement à 390 px, axe et la comparaison aux captures de
  référence desktop/mobile (≤ 1 %). Vidéos : `video/04-recherche-groupee-desktop.webm`,
  `video/05-…`, `video/08-parcourt-la-route-reelle-…`, `video/12-…`, `video/13-…`, `video/17-…` et
  `video/18-recherche-conforme-mobile.webm` ; captures `screenshots/` ; rapports d'axe dans
  `attachments/`.
