#!/usr/bin/env node
// Références visuelles du mode simple mobile (SPEC-4003 CA-4).
//
// Capture l'élément `.phone` de `design/mode-simple/index.html` à sa taille native 390 × 844 pour
// chaque étape et chaque plateforme, plus l'état « sans clé d'IA ». Le fichier de référence ne
// modifie jamais la maquette ; il est écrit dans `design/references/mode-simple/`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const playwright = await import(
  path.join(
    ROOT,
    'node_modules',
    '.pnpm',
    'playwright@1.65.0',
    'node_modules',
    'playwright',
    'index.mjs',
  )
);
const OUT = path.join(ROOT, 'design', 'references', 'mode-simple');
fs.mkdirSync(OUT, { recursive: true });

const browser = await playwright.chromium.launch();
const page = await browser.newPage({
  viewport: { width: 900, height: 1400 },
  deviceScaleFactor: 1,
});
const url = `file://${path.join(ROOT, 'design', 'mode-simple', 'index.html')}`;

for (const platform of ['ios', 'android']) {
  for (let step = 0; step < 6; step += 1) {
    await page.goto('about:blank');
    await page.goto(`${url}#view=mobile&plat=${platform}&step=${step}`);
    await page.waitForSelector('.phone');
    await page.waitForTimeout(900);
    const box = await page.locator('.phone').first().boundingBox();
    if (box === null) throw new Error('téléphone introuvable dans la maquette');
    await page.screenshot({
      path: path.join(OUT, `mobile-${platform}-${String(step + 1)}.png`),
      clip: box,
    });
  }
}

// État sans clé : l'encart orange de l'étape 2, sur les deux plateformes.
for (const platform of ['ios', 'android']) {
  await page.goto('about:blank');
  await page.goto(`${url}#view=mobile&plat=${platform}&step=1&nokey=1`);
  await page.waitForSelector('.phone');
  await page.waitForTimeout(900);
  const box = await page.locator('.phone').first().boundingBox();
  if (box === null) throw new Error('téléphone introuvable dans la maquette');
  await page.screenshot({ path: path.join(OUT, `mobile-${platform}-nokey.png`), clip: box });
}

await browser.close();
console.log(`✔ références mobile capturées dans ${path.relative(ROOT, OUT)}`);
