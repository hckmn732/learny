# SPEC-3201 — Écran Aujourd'hui : dossier de recette

Worktree `/root/wt/SPEC-3201`, branche `spec/SPEC-3201-ecran-aujourd-hui` (ADR-3018 : émulateur
Android local sur la VM de développement, API `127.0.0.1:3001`, Supabase `127.0.0.1:54321`).

## 1. Conformité visuelle (CA-5)

Comparaison `apps/mobile/e2e/visual/compare.mjs` entre la capture du flux `@visual`
(`SPEC-3201-aujourdhui`, état initial, horloge figée au 2026-11-11T12:20:00Z) et la référence
`design/app-mobile/exports/screens/android-02-aujourdhui.png` (824 × 1830), seuil 12 %.

| Itération | Écart hors zones natives | Commit |
|---|---|---|
| avant (commit `a794255b`) | 19,35 % (291 851 pixels) | — |
| après rythme de l'en-tête et de la carte | 13,22 % (199 414 pixels) | `c0fc0ef8` |
| après bande d'état de l'export et `includeFontPadding` | **6,31 %** (95 200 pixels) | `c6ce57d5` |

Les bandes y ≈ 92–824 portaient 82,7 % de l'écart ; elles sont corrigées réellement, pas masquées :

- **En-tête** (`LargeTitleHeader`, `app.css` `.largehead`) : l'écran ne tenait aucun compte de la
  barre d'état (le sur-titre passait sous l'horloge système). La géométrie de l'export est reprise
  (4/16/12 sur Android, 12/20/18 sur iOS) sous la bande d'état que la maquette dessine elle-même
  (30 dp / 54 pt). Mesure de la cause : la barre d'état du système annonce 128 px (49 dp) alors que
  l'export en dessine 30 dp, et `includeFontPadding` d'Android ajoutait une demi-ligne par texte.
- **Typographie** (`src/theme` `textStyle`) : `includeFontPadding: false`, pour que la boîte d'un
  texte suive exactement la hauteur de ligne de la maquette.
- **Carte séance** (`SessionHeroCard`, `.hero`) : padding 20 dp (22 iOS) au lieu de 16, titre 24 sp
  (26 iOS) dans la police d'affichage, méta 13/18, barre à +16, pied à +7, boutons à +18 ; la carte
  passe de 185 dp à 233 dp pour 235 dp dans la maquette.
- **Indicateurs et sections** : marges de `.stat-row` (12) et `.section` (22), `paddingHorizontal`
  16 dp au lieu d'un `gap` uniforme de 14 ; cartes du tuteur à 14/8 dp (`.tutor-card`).
- **Carte « Échauffement » (EF-7)** : absente de l'export 02 (la maquette précède EF-7), elle est
  conservée — la spécification l'exige — et **placée entre les actions du tuteur et « À suivre »**,
  ce que EF-7 autorise (« avant « À suivre » ») : l'ordre de la maquette (séance, indicateurs,
  tuteur, À suivre) est préservé et aucune zone n'est masquée pour la cacher.

**Masques** : uniquement les rectangles natifs par défaut (barre d'état 5 %, barre de navigation
5 %) et la barre d'onglets Material 3 (`spec-3201-aujourdhui.json`, 93 % → 100 %, ADR-3003 § 3).
Aucune zone de contenu n'est masquée, aucun ADR n'est invoqué pour une zone reportée.

## 2. Écarts de données assumés (API, non modifiable avant P35)

- **Rétention à un mois** : au 2026-11-11T12:20:00Z, `GET /home` renvoie `retention.oneMonth: null`
  (aucune mesure à un mois dans le jeu de démonstration). L'API l'assume : la carte affiche « — »
  (BR-MEM-06, SPEC-603 EF-3) et la fiche le texte de BR-MEM-06, pas « 86 % ». Le « 86 % » de CA-1
  est la valeur de la maquette, pas celle du serveur.
- **Durée de la séance** : `schedule_slots` porte le quiz de validation de 13:00 à 14:00 UTC
  (14:00 → 15:00 à Paris), soit 60 minutes ; `HomeSlot` n'expose que la fenêtre (`startsAt`/`endsAt`)
  et aucune durée d'activité. Le bouton affiche « Commencer · 60 min » là où la maquette écrit
  40 min : écart de données serveur, pas de règle d'affichage.
- **Texte des actions du tuteur** : le résumé vient de `GET /me/automation-actions` (ADR-0190) et
  est affiché tel quel ; il est plus long que la paraphrase de la maquette (deux à trois lignes).
- **État de démonstration** : la reprise proposée de SAP (action `298097f9…`) avait été consommée
  par une campagne précédente (`expired`). Le script de campagne la remet à `pending_consent`
  (mise à jour ciblée d'une ligne, sans `db:reset`, sous `flock /tmp/learny-sdd-db.lock`) : c'est
  l'état de la maquette et celui qu'attend CA-4 ; l'opération est idempotente.

## 3. Critères d'acceptation

- **CA-1** ✅ — séance « Quiz de validation » à 14:00, « 3 h faites » / « 5 h prévues », série
  12 jours, 4 notions, actions du tuteur affichées (`today-hero`, `stat-streak`, `stat-gaps`,
  `tutor-actions`, flux Maestro `SPEC-3201-aujourdhui.yaml`). Rétention : « — » et non « 86 % »,
  écart de données documenté au § 2.
- **CA-2** ✅ — « Commencer » remet la séance au navigateur (page web du créneau, ADR-3002 § 3) :
  la campagne vérifie que l'application quitte le premier plan ; la destination est vérifiée par
  `view-model.test.ts` (`primaryActionFor`) et `today-screen.test.tsx`. Le toast de remise n'est pas
  observable par Maestro, le navigateur passant au premier plan.
- **CA-3** ✅ — « Plus tard » ouvre la fiche `later-sheet`, le premier créneau proposé déplace la
  séance (`POST /slots/:id/move`) et le toast `today-toast-moved` apparaît.
- **CA-4** ✅ — « Accepter » retire la reprise des actions en attente, « Annuler » la défait
  (`tutor-actions.test.tsx`, flux Maestro `tutor-accept-0` / `tutor-undo-0`).
- **CA-5** ✅ — comparaison visuelle Android **6,31 %** ≤ 12 % hors zones natives ; iOS non
  exécutable sur la VM (pas de macOS), écart consigné.

## 4. Tests

| Étape | Résultat |
|---|---|
| Vitest `[SPEC-3201]` | 11 tests verts (modèle de vue, intégration `/home`, `/streak`, actions) |
| Jest `[SPEC-3201]` (`pnpm test:mobile`) | 147 tests verts (dont 26 `[SPEC-3201]`) |
| Maestro `@SPEC-3201` | 1 flux, vidéo et JUnit dans `evidence/SPEC-3201/` |
| Visuel `@visual` | 6,31 % ≤ 12 % |

Fichiers préexistants en échec sur `mobile`, hors périmètre (décision du porteur, non réparés) :
`packages/config/src/commit-rules.test.ts`, `apps/web/test/unit/bundle-split.test.ts`,
`tools/migration/test/unit/report.test.ts`.

## 5. Reproductibilité

```sh
cd /root/wt/SPEC-3201
set -a; . ./.env.local; set +a                       # copié de /root/learny-mobile
flock /tmp/learny-gradle.lock env ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64 \
  pnpm -s build:mobile:e2e
flock /tmp/learny-emulator.lock pnpm -s test:e2e:mobile --tags SPEC-3201
node tools/sdd/validate.mjs SPEC-3201 --skip-build --only e2e,visual
```
