# SPEC-115 — critères d'acceptation

Mesures du 2026-11-11T12:20:00Z (13:20 à Paris, horloge figée ADR-0047), jeu chargé par
`pnpm db:seed:demo` sur la base Supabase locale migrée. Les identifiants sont des UUID v5 du
namespace `learny-demo` (ADR-0250) ; la source de chaque valeur visible est
`packages/db/src/seed/demo-fixtures.ts` et l'inventaire SCR → tables/valeurs est
`docs/engineering/spec-115-demo-inventory.md`. Les maquettes n'ont pas été modifiées.

- ✅ **CA-1** — La seed crée Alex Perrin, les cinq formations décrites, SAP à 7 modules / 48 notions,
  le groupe de trois membres et l'agenda du 9 au 13 novembre avec les valeurs des maquettes.
  Preuve : test unitaire `[SPEC-115] demo fixtures` (`unit.json`) qui lit `Programme.dc.html`
  (7 modules, 24 chapitres exacts), `Carte.dc.html` (48 notions, maîtrises et 4 lacunes),
  `Main.dc.html` (5 formations, 38 %, 83 %, 0 %, 88 %, 82 %, 12 jours, 14 notions, 3 formations),
  `Agenda.dc.html` (22 créneaux de la semaine) et `Parametres.dc.html` (Europe/Paris, 21:00–08:00) ;
  test d'intégration « deux exécutions gardent… » (`integration.json`) ; résumé par table de
  `pnpm db:seed:demo` (5 formations, 33 modules, 56 chapitres, 104 notions dont 48 pour SAP,
  59 liens, 3 membres, 24 créneaux). Les valeurs absentes des maquettes sont des fixtures marquées
  `fixture` dans `demo-fixtures.ts`.
- ✅ **CA-2** — Deux exécutions de `db:seed:demo` gardent le même nombre, les mêmes identifiants et
  la même empreinte ; une base distante ou de production est refusée avant connexion.
  Preuve : test d'intégration « CA-1 / CA-2 — deux exécutions gardent les mêmes comptes, identifiants
  et contrôles » (`integration.json`) ; empreinte stable `demoFixtureFingerprint()` et comparaison
  des 33 comptes par table ; tests unitaires de `assertDemoEnvironment` (`APP_ENV=production|preview`
  et hôte `db.example.com` refusés) ; deux passages réels de `pnpm db:seed:demo` comparés par `diff`
  (sorties identiques : 3 utilisateurs, 11 ressources, 10 notifications, 24 créneaux, contrôles
  ✔ 7/48, 3/2, 3 membres, 22 créneaux, 5 jours, 3 non lues, 18 dues, 14 à revoir, 4 lacunes).
- ✅ **CA-3** — Les fabriques produisent des objets valides et isolés ; un membre ne voit pas les
  données personnelles d'un autre.
  Preuve : test d'intégration « les fabriques créent des lignes valides, isolées et retournent leurs
  identifiants » (12 fabriques : user, formation, module, notion, resource, course, brick, attempt,
  notionState, scheduleSlot, notification, group), « Camille et Hugo partagent le programme mais ne
  lisent pas les données d'Alex » (apports, cours, états de notions et agenda d'Alex invisibles sous
  leur JWT ; 0 ligne), « un identifiant déjà utilisé échoue explicitement » (CL-7) et « une fabrique
  refuse un owner_id incohérent » (`integration.json`).
- ✅ **CA-4** — Les textes, dates et nombres des écrans Accueil, Programme, Agenda et Paramètres
  correspondent aux fixtures et à l'instant ADR-0047.
  Preuve : tests unitaires de correspondance aux maquettes (CL-4) et de fuseau (CL-5 : 12:20Z rendu
  « 13:20 » à Europe/Paris, `09:00` locale = `08:00Z`) ; `demo-fixtures.ts` cite chaque valeur
  critique par `SCR-xx` + fichier + élément. Les écrans P6/P7 ne sont pas encore implémentés : la
  preuve porte sur les fixtures et les maquettes, sans prétendre qu'un écran futur a été validé.
- ✅ **CA-5** — La page `/_dev/sdd/SPEC-115` affiche les nombres réels, passe axe, vidéo et captures
  desktop/mobile.
  Preuve : `apps/web/e2e/specs/p1/spec-115.spec.ts` — test « inspecte les données de démonstration
  @SPEC-115 » (Alex Perrin, 3/2 formations, « SAP : 7 modules · 48 notions», « Groupe : 3 membres»,
  cinq jours, 22 créneaux, quatre événements du 11 novembre, huit contrôles de cohérence tous
  conformes, axe sans violation serious/critical, vidéo conservée) et test
  « données de démonstration conformes @SPEC-115 @visual @mobile » (jetons, structure, captures
  desktop 1440×900 et mobile 390×844, tableau défilant). Preuves dans `checks.json`, `video/`,
  `screenshots/` et les lignes de base `apps/web/e2e/__screenshots__/p1/spec-115.spec.ts/`.
