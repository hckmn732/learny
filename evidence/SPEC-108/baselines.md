# Lignes de base visuelles modifiées

- `apps/web/e2e/__screenshots__/p1/spec-101-db.spec.ts/spec-101-demo-desktop-linux.png` —
  régénérée par `pnpm test:e2e --grep "@SPEC-101" --update-snapshots`. La page de démonstration de
  SPEC-101 liste les migrations appliquées ; les migrations `0016_planning` et
  `0017_planning_rules` ajoutent deux lignes à ce tableau. Aucun autre écran de la phase P1 n'a
  changé : les tests e2e `@SPEC-101` à `@SPEC-108` passent après la mise à jour.
- `apps/web/e2e/__screenshots__/p1/spec-108.spec.ts/spec-108-planning-desktop-linux.png` et
  `…-mobile-linux.png` — nouvelles lignes de base de la page SPEC-108, générées par
  `pnpm test:e2e --grep "@SPEC-108" --update-snapshots` puis vérifiées sans mise à jour.
