# Maquettes mobiles — rattrapage des parcours web (ADR-4002 §3)

Propositions d'écrans mobiles pour les parcours qui renvoient encore au web
(« Continuer sur le web »). Elles servent de base aux spécifications de rattrapage
(phases après P40). Proposition du 2026-11-25, non normative tant qu'une spécification
ne l'a pas reprise.

- Canevas interactif (source) : https://claude.ai/artifact/EZtwN1DQQWGsRDYNTtExcC
- `ecrans/*.dc.html` : source de chaque écran (format Design Component du canevas, 390 × 844).
  Ils s'ouvrent dans le canevas ; hors canevas, lire le balisage comme une maquette annotée.
- `canvas.json` : disposition du canevas.
- `index.html` : sommaire des écrans.

Ouvrir en local : les écrans ont besoin d'un serveur HTTP (en `file://`, le moteur `support.js`
ne s'exécute pas et les gabarits `{{…}}` restent visibles) :

```sh
cd design/app-mobile-rattrapage && python -m http.server 8765
# puis http://127.0.0.1:8765/ (sommaire) ou http://127.0.0.1:8765/ecrans/CarteCerveau.dc.html
```

`ecrans/support.js` est une copie du moteur de `design/maquettes/` (non modifié).

Style : jetons de `@learny/ui` (canvas `#F4F4F1`, encre `#111113`, citron `#C6F432`,
indigo `#5B5BD6`), Space Grotesk pour les titres, Inter pour le texte. Chaque écran porte
des animations légères (entrées en cascade, pulsations, brillances), toutes coupées par
`prefers-reduced-motion`.

## Écrans, par ordre de priorité d'ADR-4002 §3

| Rang | Écran | Fichier | Point d'entrée mobile actuel | Page web remplacée |
|---|---|---|---|---|
| — | Cartographie des renvois web | `Main.dc.html` | — | — |
| 1 | Ajout d'apports et import du programme | `Apports.dc.html` | Programme › Importer, créneau « Apports » | `/formations/:fid/programme` |
| 2a | Cadrage avec le tuteur (5 questions) | `Cadrage.dc.html` | Aujourd'hui › Construire avec le tuteur ; Programme › + | `/formations/nouvelle` |
| 2b | Programme proposé (ajuster, valider) | `Proposition.dc.html` | Programme › Proposition à valider | `/formations/:fid/programme` |
| 3 | Exercice pratique (consigne, minuteur, barème) | `Exercice.dc.html` | Cours › briques web (instruction, dialogue, minuteur, barème) | `/cours/:id` |
| 4 | Lacunes | `Lacunes.dc.html` | Aujourd'hui › feuille Lacunes | `/lacunes` |
| 5 | Carte des notions (grille) | `Carte.dc.html` | aucune entrée dédiée | `/formations/:fid/carte` |
| 5b | Carte des notions — mode cerveau (réseau interactif) | `CarteCerveau.dc.html` | aucune entrée dédiée | `/formations/:fid/carte` |
| 6 | Examen blanc | `ExamenBlanc.dc.html` | créneau « Examen blanc » | href du créneau |
| 7 | Bilan final | `Bilan.dc.html` | Programme › Bilan | `/formations/:fid/bilan` |
| 8 | Recherche | `Recherche.dc.html` | aucune | `/recherche` |
| 9 | Premiers pas natifs (étape rythme) | `PremiersPas.dc.html` | écran « Terminez votre configuration sur le web » | `/premiers-pas/:etape` |
| 10 | Clés d'IA personnelles | `ClesIA.dc.html` | Profil › Modèles d'IA ; Tuteur › Choisir un modèle | `/parametres#modeles` |
| 11 | Formations à plusieurs | `Groupe.dc.html` | invitation, formation de groupe | `/formations/:fid/groupe` |
| 12 | Abonnement | — (reste web, règles des stores, ADR-3006) | Profil › Abonnement | `/parametres` |

Restent volontairement sur le web : pages juridiques (CGU, confidentialité, mentions) et achat
d'abonnement. La remédiation du quiz, les notifications et la replanification détaillée suivent le
parcours cible et disparaissent quand il est rattrapé.

Les contenus d'exemple (SAP S/4HANA Finance, Camille, Hugo…) reprennent le jeu de démonstration.
