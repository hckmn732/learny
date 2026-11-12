# Lignes de base visuelles — SPEC-109

- **Créées** :
  `apps/web/e2e/__screenshots__/p1/spec-109.spec.ts/spec-109-notifications-desktop-linux.png`
  et `…-mobile-linux.png`. La première exécution du test `@visual` a écrit les fichiers manquants ;
  la seconde passe avec `maxDiffPixelRatio: 0.01`.
- **Modifiées** : aucune ligne de base existante. La page `/_dev/sdd/SPEC-109` est une nouvelle page
  de démonstration ; elle n'en modifie aucune autre.
- **Conformité** : `testing.md` §6 — page de démonstration SDD sans maquette, donc contrôles 1
  (jetons), 2 (structure et textes) et 4 (non-régression par capture) ; pas de comparaison
  `design/references` ni de diff dans `visual/`, conformément à la règle applicable aux pages SDD.
- **Déterminisme** : horloge figée au 2026-11-11T12:20:00Z, fuseau Europe/Paris, fixtures créées et
  annulées dans la même requête.
