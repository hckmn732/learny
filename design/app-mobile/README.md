# Learny · maquettes de l’application iOS et Android

Proposition de maquettes natives pour l’application mobile Learny, construite à partir du
design system existant (`design/references/tokens.json`, `docs/product/screens.md`) et des
données de démonstration du 11 novembre 2026.

**Statut** : proposition de conception, non implémentée. Les maquettes web normatives de
`design/maquettes/` ne sont pas modifiées.

## Ouvrir

- `index.html` — planche complète : comparaison iOS / Android, galerie des 9 écrans,
  conventions de plateforme, jetons et typographie. À ouvrir dans Chrome ou Edge.
- `view.html#screen=today&platform=ios` — un écran seul, à taille réelle (paramètres
  `screen`, `platform=ios|android`, `sheet=1` pour la feuille du tuteur, `plain=1` pour
  l’écran sans cadre, aux dimensions natives).
- Les téléphones de la galerie sont interactifs : onglets, quiz (sélection puis validation),
  feuille du tuteur, cartes de révision, déconnexion, notifications, agenda, réglages.
  Chaque action produit un changement d’état, une feuille ou un toast — voir
  « Interactions du prototype » plus bas.

Aucun serveur n’est nécessaire : tout fonctionne en `file://`, sans dépendance npm.
Les polices Inter et Space Grotesk sont chargées depuis Google Fonts ; hors ligne, le
système prend le relais.

## Les écrans

| # | Écran | Rôle | Interactions |
|---|---|---|---|
| 01 | Connexion | Reprendre une session, Apple / Google | « Se connecter » mène à Aujourd’hui |
| 02 | Aujourd’hui | Séance du jour, série, rétention, lacunes, actions du tuteur | Séance → quiz, cours, quiz global |
| 03 | Programme | Formation, modules, chapitres, reprise | Chapitre → cours, FAB Android |
| 04 | Cours | Lecture du chapitre, repères, avertissement, à retenir | « Demander au tuteur » ouvre la feuille |
| 05 | Cours · tuteur | Question, réponse sourcée, réponses rapides, saisie | Fermeture par la poignée, le fond ou la croix |
| 06 | Quiz de validation | Question, progression, chronomètre, validation | Sélection, validation, correction, question suivante |
| 07 | Quiz global | Révision en cartes, série, report décidé par le tuteur | Révéler, « À revoir », « Je savais » |
| 08 | Agenda | Semaine, journée, activité sélectionnée | Ouverture du quiz ou de la session |
| 09 | Profil | Compte, réglages, abonnement, déconnexion | « Se déconnecter » ramène à la connexion |

## Interactions du prototype

Tout est local et simulé : aucun appel réseau, aucun backend. L’état est conservé par
téléphone tant que la page reste ouverte (un rechargement remet la démo à zéro).

- **Global** : bascule iOS / Android, transitions avant / arrière / fondu entre écrans,
  feuilles animées, toasts, fermeture au fond ou avec `Échap`, focus rendu au bouton d’origine.
- **Connexion** : bascule connexion / inscription, chargement simulé, Apple et Google,
  mot de passe oublié, CGU et confidentialité.
- **Aujourd’hui** : notifications (filtres, tout lire, ouverture), compte, report de séance,
  fiches série / rétention / lacunes, accepter ou replanifier la reprise, fil des actions.
- **Programme** : modules / calendrier, accordéon du module 2, nouvelle formation,
  import simulé en deux étapes, module verrouillé.
- **Cours** : favori, progression de lecture au défilement, feuille tuteur avec suggestions,
  saisie libre, indicateur de frappe et réponse simulée, quiz.
- **Quiz** : sélection, validation, correction, confirmation de sortie, résultat, rejeu.
- **Réviser** : révéler, « À revoir » / « Je savais », annulation du report, fiche série.
- **Agenda** : jour / semaine / mois, changement de jour, filtre par formation (avec état vide),
  fiche activité, replanification.
- **Profil** : réglages, identité, notifications, sécurité, rythme, modèles, abonnement,
  aide, confidentialité, déconnexion.

Les captures d’`exports/` montrent l’état initial ; les états intermédiaires se découvrent
dans `index.html`. Le mode `prefers-reduced-motion` coupe les animations.

## Choix de conception

- **Même architecture, même contenu.** Cinq destinations identiques (Aujourd’hui,
  Programme, Réviser, Agenda, Profil). Cours, quiz et tuteur sont des écrans secondaires
  empilés au-dessus de l’onglet, avec retour explicite.
- **Chrome natif, pas de composant hybride.** iOS : barre d’onglets translucide, grands
  titres, feuille à hauteur libre, segmented control. Android : navigation bar Material 3
  avec pastille active, top app bar, FAB, bottom sheet 28 dp.
- **La marque ne bouge pas.** Crème `#F4F4F1`, encre `#111113`, citron `#C6F432` pour
  l’action et la progression, indigo pour le tuteur et les liens, orange pour l’attention.
  Space Grotesk pour les titres, Inter pour le texte.
- **Échelles natives.** iOS : titre large 34 pt, corps 16 pt, cible 44 pt. Android :
  headline 31 sp, corps 16 sp, cible 48 dp.
- **Données de démonstration.** Alex Perrin, SAP S/4HANA Finance à 38 %, module 3
  « Comptabilité générale », quiz à 14:00 (tentative 2, seuil 80 %), série de 12 jours,
  rétention 86 %, 4 lacunes, quiz global à 17:00.

## Formats

- iOS : 393 × 852 pt (iPhone 16 Pro), cadre compris 415 × 874.
- Android : 412 × 915 dp (Pixel 9), cadre compris 432 × 935.
- Exports PNG encadrés : `exports/`, facteur 2 (830 × 1748 et 864 × 1870), plus
  `exports/board.png` pour l’aperçu de la planche.
- Exports écran seul : `exports/screens/`, facteur 2, **786 × 1704** (iOS) et
  **824 × 1830** (Android), soit les dimensions exactes des exports Figma.
- États d’interaction : `exports/states/` (notifications, tuteur en conversation, résultat
  du quiz, agenda au mois, calendrier du programme).

## Régénérer les exports

```bash
node design/app-mobile/export.mjs
```

Le script détecte Chrome ou Edge. Sinon : `CHROME_PATH="/chemin/vers/chrome"`.
Les fichiers sont écrits dans `exports/` (`ios-*.png`, `android-*.png`) et
`exports/screens/` (`ios-01-connexion.png`, `android-05-quiz.png`, etc.).

## Apports de la référence Figma

La planche `design/Learny — App mobile (iOS + Android)` a servi de contraste. Ont été
repris :

- **l’échelle typographique** : corps 16 pt / 16 sp, titres 34 pt / 31 sp, libellés d’onglet
  11,5 / 12, titres de navigation 16 / 19, barre d’état 16,5 / 13 ;
- **les exports plein écran** 786 × 1704 et 824 × 1830, superposables aux cadres Figma ;
- **les rayons et les cibles** : cartes 22 pt, options 20 pt, boutons d’icône 44 pt ;
- **la neutralité Material du statut « En cours »** sur Android, le citron restant réservé à
  l’action ; iOS conserve le citron ;
- **les icônes de fournisseur** à 20 px et la marque Google officielle en quatre couleurs
  (l’annotation verte de la maquette Android pointait un logo déformé).

Écarts assumés par rapport à la référence :

- le lien « Ouvrir » de l’activité en cours reste **citron sur le fond encre** (l’indigo de
  la référence tombe sous le seuil de contraste) ;
- les chips d’agenda gardent leur **couleur de sens** (fait, à faire, à venir) au lieu d’un
  gris uniforme ;
- « Importer votre programme » est remonté **sous le sélecteur Modules / Calendrier** pour
  que le FAB Android ne recouvre plus le bouton ;
- le chip du module 2 affiche « Validé » et le pourcentage passe dans le sous-titre, pour
  éviter un retour à la ligne du titre.

## Ce qui n’est pas couvert

- Mode sombre, tablette, paysage et pliage.
- Animations, transitions et retours haptiques (à spécifier).
- États d’erreur, chargement, hors-ligne et permissions (caméra, micro, notifications).
- Audit d’accessibilité sur appareil : les cibles, contrastes et libellés sont vérifiés à la
  conception, pas encore au lecteur d’écran.
- Choix technique d’implémentation (natif, Kotlin Multiplatform, Flutter) : la maquette est
  volontairement neutre.

## Fichiers

```
app-mobile/
├─ index.html          planche de présentation
├─ view.html           écran seul (export / aperçu)
├─ export.mjs          génération PNG sans dépendance
├─ assets/
│  ├─ app.css          jetons, cadres, composants, écrans
│  ├─ icons.js         jeu d’icônes (traits 1,8 px)
│  ├─ screens.js       contenu des 8 écrans
│  └─ app.js           coquille, navigation, interactions
└─ exports/
   ├─ *.png            appareil encadré, planche et présentation
   ├─ screens/         écran seul 786 × 1704 / 824 × 1830
   └─ states/          captures d’états interactifs
```
