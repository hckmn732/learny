# Écrans, routes et maquettes

Les maquettes cliquables sont dans `design/maquettes/` (fichiers `*.dc.html`, moteur `support.js`, ouvrir `index.html`). Elles font foi pour la **structure, les textes, les états et le style** de chaque écran. Les références visuelles générées (captures 1440×900 et 390×844) sont produites dans `design/references/` par SPEC-005. La méthode de vérification visuelle est décrite dans `docs/engineering/testing.md` §6 et ADR-0034.

## 1. Inventaire

| ID | Écran | Route (App Router, `apps/web/app`) | Maquette | Spécifications principales |
|---|---|---|---|---|
| SCR-01 | Inscription, connexion, vérification | `/inscription`, `/connexion`, `/verifier-email` | `Inscription.dc.html` (étapes Compte, Vérification ; `?connexion`) | SPEC-601 |
| SCR-02 | Premiers pas (onboarding) | `/premiers-pas/[etape]` (`profil`, `rythme`, `ia`, `rappels`, `depart`) | `Inscription.dc.html` (étapes 3 à 7) | SPEC-602 |
| SCR-03 | Accueil | `/accueil` (`/` redirige) | `Main.dc.html` | SPEC-603, 712, 714, 720, 722 |
| SCR-04 | Nouvelle formation (cadrage) | `/formations/nouvelle`, puis `/formations/[fid]/cadrage` | `NouvelleFormation.dc.html` | SPEC-604 |
| SCR-05 | Programme (proposé / en cours) | `/formations/[fid]/programme` | `Programme.dc.html` (`?proposition` = proposé) | SPEC-605, 606 |
| SCR-06 | Module et apports | `/formations/[fid]/modules/[mid]` | `Module.dc.html` | SPEC-607 |
| SCR-07 | Cours + discussion tuteur | `/formations/[fid]/modules/[mid]/cours?chapitre=[cid]` | `Cours.dc.html` | SPEC-609, 610 |
| SCR-08 | Exercice pratique | `/formations/[fid]/modules/[mid]/exercices/[aid]` | `Exercice.dc.html` | SPEC-613 |
| SCR-09 | Quiz de validation (+ résultat, remédiation) | `/formations/[fid]/modules/[mid]/quiz` , `/formations/[fid]/modules/[mid]/quiz/[attemptId]/resultat`, `/formations/[fid]/modules/[mid]/remediation` | `Quiz.dc.html` | SPEC-611, 612 |
| SCR-10 | Quiz global | `/formations/[fid]/quiz-global` | `QuizGlobal.dc.html` | SPEC-701, 702, 703 |
| SCR-11 | Examen blanc | `/formations/[fid]/examen-blanc` , `/formations/[fid]/examen-blanc/[attemptId]` | `ExamenBlanc.dc.html` | SPEC-614 |
| SCR-12 | Agenda | `/agenda?vue=jour|semaine|mois&date=YYYY-MM-DD&formation=all|[fid]` | `Agenda.dc.html` | SPEC-704, 705 |
| SCR-13 | Mes lacunes | `/formations/[fid]/lacunes?nature=` | `Lacunes.dc.html` | SPEC-615 |
| SCR-14 | Carte des notions | `/formations/[fid]/carte` | `Carte.dc.html` | SPEC-616 |
| SCR-15 | Paramètres | `/parametres#profil|notifications|automatismes|modeles` | `Parametres.dc.html` | SPEC-707 à 710, 725 |
| SCR-16 | Bilan final de formation | `/formations/[fid]/bilan` | *aucune* — composer selon §3 | SPEC-617 |
| SCR-17 | Formation à plusieurs (membres, invitation) | `/formations/[fid]/groupe`, `/invitation/[code]` | *aucune* — composer selon §3 | SPEC-724 |
| SCR-18 | Résultats de recherche | `/recherche?q=` | *aucune* (le panneau d'en-tête suit la maquette du panneau notifications) | SPEC-307 |
| SCR-19 | Pages légales | `/legal/cgu`, `/legal/confidentialite`, `/legal/mentions` | *aucune* | SPEC-806 |
| SCR-20 | Pages système | `not-found`, `error`, `/hors-ligne` | *aucune* | SPEC-308, 801 |

`[fid]`, `[mid]`, `[cid]`, `[aid]` sont des UUID. Les routes sont en français (ADR-0046).

## 2. Éléments communs (coquille, SPEC-304 à 307)

Présents sur tous les écrans connectés sauf SCR-01/02 (mise en page dédiée) et SCR-11 pendant l'épreuve :
- **Menu latéral** (fond `#111113`, largeur 248 px à l'échelle maquette) : logo « Learny », bouton masquer ; Accueil, Agenda ; séparateur ; section « Formation en cours » (carte sigle + titre + barre + « Module n sur N », bouton « Changer de formation », Programme, Carte des notions, Quiz global + badge, Mes lacunes + badge) ; bloc Série (n jours, 14 cases de régularité).
- **En-tête figé** (fond translucide flouté) : bouton « Afficher le menu » (si masqué), champ de recherche, cloche + pastille, bouton « Mon compte » (avatar initiales) ouvrant le menu (Apprenant, n formations en cours, Paramètres, Mettre en pause, Se déconnecter).
- **Panneau notifications** : voir BR-NOT-01 et la maquette (tous les écrans la contiennent).

## 3. Écrans sans maquette

Les écrans SCR-16 à SCR-20 se composent **exclusivement** avec les composants du design system (SPEC-301 à 303) en reprenant les motifs des maquettes existantes :
- en-tête de page = sur-titre 14 px gris + titre 34 px Space Grotesk (comme `Lacunes.dc.html`) ;
- indicateurs = rangée de cartes statistiques (première carte sombre `#111113` avec chiffre `#C6F432`, suivantes blanches) ;
- listes = cartes blanches bordées `#E7E6E1`, rayon 24 px ;
- actions principales = bouton citron `#C6F432` ou noir `#111113`, secondaires = bordure `#DAD9D3`.
Chaque spécification concernée décrit précisément la structure attendue et la vérification visuelle se fait par conformité aux jetons et aux motifs (ADR-0034).

## 4. Données de démonstration

Les maquettes montrent la journée du **mercredi 11 novembre 2026, 13:20 (Europe/Paris)** de l'utilisateur Alex Perrin. Le jeu de données `SPEC-115` reproduit exactement ces données ; les tests end-to-end fixent l'horloge du navigateur et du serveur à cet instant (ADR-0047) pour que les captures soient comparables aux maquettes.
