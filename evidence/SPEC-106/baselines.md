# Lignes de base visuelles modifiées

- `apps/web/e2e/__screenshots__/p1/spec-101-db.spec.ts/spec-101-demo-desktop-linux.png` —
  régénérée par `pnpm test:e2e --grep "@SPEC-101" --update-snapshots`. La page de démonstration de
  SPEC-101 liste les migrations appliquées ; les migrations `0012_bricks_activities` et
  `0013_bricks_activities_rules` ajoutent deux lignes à ce tableau. Aucun autre écran de la phase
  P1 n'a changé : les 13 tests e2e `@SPEC-10` passent après la mise à jour.
