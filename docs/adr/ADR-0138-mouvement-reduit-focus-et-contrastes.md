# ADR-0138 — Mouvement réduit, focus et contrastes

- **Statut** : Acceptée
- **Origine** : Déduite (décision déjà référencée par SPEC-303, généralisée par SPEC-309)
- **Date** : 2026-11-11
- **Liens** : SPEC-303, SPEC-309, SPEC-803

## Contexte

Les menus, panneaux et notifications animés doivent rester utilisables au clavier et avec une préférence de mouvement réduit. Les jetons de couleurs doivent satisfaire WCAG 2.2 AA dans leurs usages réels.

## Décision

Les transitions des composants sont courtes et ne conditionnent jamais la disponibilité d'une action. Sous `prefers-reduced-motion: reduce`, les animations et déplacements décoratifs sont supprimés ; l'état final est rendu immédiatement. À l'ouverture d'un dialogue ou panneau modal, le focus entre dans la région ; à la fermeture, il revient au déclencheur si celui-ci existe encore. Le focus visible utilise un contour de jeton dédié, jamais supprimé par un style local. Les contrastes sont vérifiés sur les combinaisons réellement employées (texte, icône, bordure d'état, focus) ; un échec impose la correction du jeton ou de son usage, pas une exemption du test.

## Conséquences

SPEC-309 généralise les helpers et SPEC-803 audite les parcours complets. Les captures de non-régression sont produites avec un état de mouvement défini et reproductible.
