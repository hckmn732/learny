# SPEC-307 — critères d'acceptation

- ✅ **CA-1** — Une requête de deux caractères affiche les résultats groupés de SPEC-212 (Notions, Chapitres, Formations) avec leurs liens profonds ; un seul caractère n'envoie aucune requête API. Preuve : test unitaire `[SPEC-307]` « n’interroge l’API qu’à partir de deux caractères normalisés » (zéro appel sous deux caractères, appel `{ q: 'réseau' }` ensuite), e2e `@SPEC-307` (aucune requête avant deux caractères, 5 résultats groupés pour `reseau`), captures `evidence/SPEC-307/screenshots/` et vidéo du scénario.
- ✅ **CA-2** — Les flèches Haut/Bas déplacent l'option active, Entrée ouvre son lien, Échap ferme la liste et Tab poursuit l'ordre normal, selon le motif combobox ARIA (`aria-expanded`, `aria-controls`, `aria-activedescendant`). Preuve : test unitaire « suit le motif combobox au clavier et ouvre le résultat actif », test d'intégration `[SPEC-307]` « rend la page complète, les groupes et les liens profonds », e2e `@SPEC-307` (flèches puis Entrée ouvrent `/formations/<id>/programme#notion-<id>`).
- ✅ **CA-3** — Une recherche accentuée (`RÉSEAU`) et sa version sans accent (`reseau`) produisent le même jeu de résultats autorisés ; aucun contenu d'un autre utilisateur n'apparaît. Preuve : test unitaire « rend le même jeu de résultats avec accents et sans accent », test d'intégration « isole deux utilisateurs par RLS et garde la route d’API sûre » (Alice ne voit jamais les contenus de Bob et inversement), e2e `@SPEC-307` (titres identiques pour les deux requêtes).
- ✅ **CA-4** — Une réponse réseau retardée ne remplace pas les résultats de la dernière requête ; les états chargement, vide et erreur restent utilisables avec Réessayer et sans résultat périmé. Preuve : test unitaire « ignore la réponse tardive d’une ancienne requête » et « affiche une erreur réessayable sans effacer la requête », test d'intégration « distingue requête courte, aucun résultat et erreur sûre », e2e `@SPEC-307` (erreur 500 interceptée, saisie conservée, Réessayer affiche l'état vide).
- ✅ **CA-5** — La page sans maquette respecte les jetons de `screens.md` §3, passe axe (`serious`/`critical` = 0) et la capture de non-régression à 1 % maximum, en desktop 1440×900 et mobile 390×844, avec vidéo. Preuve : test `@SPEC-307 @visual` (expectTokens sur `search-page-item`, `search-page-item-type` et le panneau 400 px/rayon 18 px/ombre popover ; captures `spec-307-recherche` et `spec-307-panneau` desktop et mobile ; axe), baselines `apps/web/e2e/__screenshots__/p3/spec-307.spec.ts/` créées pour ce seul écran, et vidéos `evidence/SPEC-307/video/`.

## Validation observée

- `lint`, `typecheck`, `build` : réussis sur tout le dépôt (OpenAPI et migrations à jour).
- Unitaires : 7 tests `[SPEC-307]` réussis, 0 échec (`unit.json`).
- Intégration : 3 tests `[SPEC-307]` réussis, 0 échec (`integration.json`).
- Navigateur : 4 tests `@SPEC-307` réussis, 0 échec, 12 vidéos (`e2e.json`, `e2e.xml`).
- Visuel : 2 tests `@SPEC-307 @visual` réussis (`checks.json`), axe sans violation bloquante.
- Non-régression : `[SPEC-305]` (10 unitaires), `[SPEC-212]` (41 unitaires, 10 d'intégration), `@SPEC-305` et `@SPEC-212` (8 e2e) rejoués sans échec ; les baselines SPEC-305 restent inchangées.
- Baselines ajoutées (aucune ligne existante modifiée) : `spec-307-recherche-desktop-linux.png`, `spec-307-panneau-desktop-linux.png`, `spec-307-recherche-mobile-linux.png`, `spec-307-panneau-mobile-linux.png`. Justification : SCR-18 n'existait pas avant SPEC-307 ; ces captures figent son apparence et servent de référence aux spécifications suivantes (ADR-0034 §4).

