# Design

- `maquettes/` : les 14 écrans cliquables de Learny (`*.dc.html`, rendus par `support.js`). Ouvrir `maquettes/index.html`. **Référence visuelle normative, en lecture seule** : aucun agent ne les modifie.
- `references/` : captures de référence générées depuis les maquettes par SPEC-005 (bureau 1440×900 et mobile 390×844, horloge figée au 2026-11-11T12:20:00Z). Elles servent à la comparaison côte à côte des tests `@visual` (écart ≤ 12 %, ADR-0034).

Correspondance écran → maquette → route : `docs/product/screens.md`. Échelle d'affichage : les maquettes sont conçues pour un rendu à 90 % (`html { font-size: 90% }`, jetons en rem, ADR-0034).
