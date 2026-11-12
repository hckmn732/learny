# Lignes de base visuelles modifiées

- `apps/web/e2e/__screenshots__/p1/spec-101-db.spec.ts/spec-101-demo-desktop-linux.png` —
  régénérée par `pnpm test:e2e --grep "@SPEC-101" --update-snapshots`. La page de démonstration de
  SPEC-101 liste les migrations appliquées ; les migrations `0014_memory` et `0015_memory_rules`
  ajoutent deux lignes à ce tableau (hauteur 2158 → 2240 px, 5 % de pixels différents). Aucun autre
  écran de la phase P1 n'a changé : les tests e2e `@SPEC-10[1-7]` passent après la mise à jour.
- `apps/web/e2e/__screenshots__/p1/spec-107.spec.ts/spec-107-memory-desktop-linux.png` et
  `…-mobile-linux.png` — nouvelles lignes de base de la page SPEC-107, générées par
  `pnpm test:e2e --grep "@SPEC-107" --update-snapshots` puis vérifiées sans mise à jour.
