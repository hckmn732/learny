# @learny/testing

Harnais de tests partagé (SPEC-004) : horloge figée, gardes d'environnement, fixtures Playwright,
comparaisons visuelles et doublures HTTP. Aucun service réel ni fournisseur IA n'est appelé en test.

## API publique

| Import                       | Exports                                                                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@learny/testing`            | `createFixedClock(iso?)` (défaut `2026-11-11T12:20:00Z`, nouvel objet `Date` à chaque appel), `FIXED_TIME_ISO`, `DISPLAY_TIME_ZONE`, `assertMockLlm(env)`, `assertTestServerEnv(env)`, `TEST_SERVER_ENV` |
| `@learny/testing/playwright` | `test` (fixtures `fixedTime` automatique, `consoleErrors`, `axeCheck`, `captureEvidence`), `expect`, `expectServerTimeMatchesPage(page, iso)`                                                            |
| `@learny/testing/visual`     | `expectTokens(page, selectors)`, `compareWithReference(actual, reference, outputDir, name?)`, `PROVISIONAL_TOKENS`, `MOCKUP_MAX_DIFF_RATIO` (0,12), `BASELINE_MAX_DIFF_RATIO` (0,01)                     |
| `@learny/testing/msw`        | `createMockServer(...handlers)` (requête non simulée = échec), `jsonHandler(method, url, body, status?)`, `http`, `HttpResponse`                                                                         |
| `@learny/testing/render`     | `renderComponent(ui)` (rendu Testing Library + `user`)                                                                                                                                                   |

## Exemples

```ts
import { test, expect } from '@learny/testing/playwright';
import { expectTokens, PROVISIONAL_TOKENS } from '@learny/testing/visual';

test('écran @SPEC-xxx @visual', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-xxx');
  await expectTokens(page, { '[data-testid="x"]': { color: PROVISIONAL_TOKENS.color.text } });
  await axeCheck();
  await expect(page).toHaveScreenshot('x.png', { maxDiffPixelRatio: 0.01 });
});
```

`compareWithReference` ne redimensionne jamais : des dimensions différentes échouent, une référence
absente échoue (mode `mockup`). Les modes `tokens` et `demo` n'appellent pas ce comparateur.
