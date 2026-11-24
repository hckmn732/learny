// Table versionnée des états de maquettes capturés en référence (SPEC-005, EF-2, ET-2) et des six
// étapes du mode simple (SPEC-4002 §10, ADR-0034).
// Chaque scénario part d'un contexte neuf ; `setup` atteint l'état par l'interface, `expect` vérifie
// une condition observable avant la capture. Aucune temporisation fixe, aucun clic aveugle.
//
// Les scénarios du mode simple portent en plus :
// - `dir` : dossier des sources (`design/mode-simple`), `index.html` étant la planche entière ;
// - `sources` : source par viewport — la planche est fixe en 1280 px, donc la vue « Mobile » de la
//   maquette sert la capture 390×844 ;
// - `zoom` : 90 %, l'échelle des maquettes (BR-NAV-06), que la planche n'applique pas elle-même ;
// - `rectSelector` : la zone comparable à l'application, mesurée dans la planche et publiée dans
//   `rects.json` (comparaison de région, docs/engineering/testing.md §6).

const heading = (page, name) => page.getByRole('heading', { name, exact: false }).first().waitFor({ state: 'visible' });
const click = (page, role, name) => page.getByRole(role, { name, exact: false }).first().click();

async function signupTo(page, step) {
  await page.getByLabel('Adresse e-mail').fill('alex.perrin@exemple.fr');
  await page.getByRole('checkbox').first().check();
  await click(page, 'button', 'Recevoir mon lien');
  await heading(page, 'Vérifiez votre boîte mail');
  if (step === 'verification') return;
  await click(page, 'button', "J'ai cliqué sur le lien");
  await heading(page, 'Faisons connaissance');
  if (step === 'profil') return;
  await click(page, 'button', 'Continuer');
  await heading(page, 'Votre rythme');
  if (step === 'rythme') return;
  await click(page, 'button', 'Continuer');
  await heading(page, 'Votre IA');
  if (step === 'ia') return;
  await page.getByRole('radio', { name: /fournie par Learny/ }).click();
  await click(page, 'button', 'Continuer');
  await page.getByRole('heading', { name: 'Votre IA' }).waitFor({ state: 'hidden' });
  if (step === 'rappels') return;
  await click(page, 'button', 'Continuer');
}

const base = (screenId, file, title) => ({
  screenId,
  state: 'base',
  source: file,
  setup: () => Promise.resolve(),
  expect: (page) => heading(page, title),
});

export const SCENARIOS = [
  // SCR-01 / SCR-02 — Inscription.dc.html (étapes Compte → Départ, ?connexion)
  base('SCR-01', 'Inscription.dc.html', 'Créer votre compte'),
  { screenId: 'SCR-01', state: 'connexion', source: 'Inscription.dc.html?connexion', setup: () => Promise.resolve(), expect: (page) => page.getByRole('radio', { name: /Avec mon mot de passe/ }).waitFor() },
  { screenId: 'SCR-01', state: 'verification', source: 'Inscription.dc.html', setup: (page) => signupTo(page, 'verification'), expect: (page) => heading(page, 'Vérifiez votre boîte mail') },
  { screenId: 'SCR-02', state: 'profil', source: 'Inscription.dc.html', setup: (page) => signupTo(page, 'profil'), expect: (page) => heading(page, 'Faisons connaissance') },
  { screenId: 'SCR-02', state: 'rythme', source: 'Inscription.dc.html', setup: (page) => signupTo(page, 'rythme'), expect: (page) => heading(page, 'Votre rythme') },
  { screenId: 'SCR-02', state: 'ia', source: 'Inscription.dc.html', setup: (page) => signupTo(page, 'ia'), expect: (page) => heading(page, 'Votre IA') },
  { screenId: 'SCR-02', state: 'rappels', source: 'Inscription.dc.html', setup: (page) => signupTo(page, 'rappels'), expect: (page) => page.getByText('Rappels', { exact: false }).first().waitFor() },
  { screenId: 'SCR-02', state: 'depart', source: 'Inscription.dc.html', setup: (page) => signupTo(page, 'depart'), expect: (page) => page.getByText('Départ', { exact: false }).first().waitFor() },

  // SCR-03 — Main.dc.html et états de la coquille commune
  base('SCR-03', 'Main.dc.html', "Votre journée d'apprentissage"),
  { screenId: 'SCR-03', state: 'notifications', source: 'Main.dc.html', setup: (page) => click(page, 'button', 'Notifications'), expect: (page) => page.locator('[data-popover-toggle="notifications"][aria-expanded="true"]').waitFor() },
  { screenId: 'SCR-03', state: 'compte', source: 'Main.dc.html', setup: (page) => click(page, 'button', 'Mon compte'), expect: (page) => page.locator('[data-popover-toggle="compte"][aria-expanded="true"]').waitFor() },
  { screenId: 'SCR-03', state: 'formations-terminees', source: 'Main.dc.html', setup: (page) => click(page, 'tab', 'Terminées'), expect: (page) => page.locator('[data-tab="formations:terminees"][aria-selected="true"]').waitFor() },
  { screenId: 'SCR-03', state: 'menu-reduit', source: 'Main.dc.html', setup: (page) => click(page, 'button', 'Masquer le menu'), expect: (page) => page.locator('html[data-sidebar="collapsed"]').waitFor({ state: 'attached' }) },

  // SCR-04 à SCR-14
  // SPEC-802 ET-5 — état mobile « menu masqué » des quatre écrans de référence.
  ...[
    ['SCR-03', 'Main.dc.html'],
    ['SCR-07', 'Cours.dc.html'],
    ['SCR-10', 'QuizGlobal.dc.html'],
    ['SCR-12', 'Agenda.dc.html'],
  ].map(([screenId, file]) => ({
    screenId,
    state: 'menu-masque',
    source: file,
    viewports: ['mobile'],
    setup: (page) => click(page, 'button', 'Masquer le menu'),
    expect: (page) => page.locator('html[data-sidebar="collapsed"]').waitFor({ state: 'attached' }),
  })),

  base('SCR-04', 'NouvelleFormation.dc.html', 'formation'),
  base('SCR-05', 'Programme.dc.html', 'Modules et chapitres'),
  { screenId: 'SCR-05', state: 'proposition', source: 'Programme.dc.html?proposition', setup: () => Promise.resolve(), expect: (page) => page.locator('button[aria-expanded="true"]').filter({ hasText: /^\s*1/ }).first().waitFor() },
  base('SCR-06', 'Module.dc.html', 'Comptabilité générale'),
  base('SCR-07', 'Cours.dc.html', ''),
  base('SCR-08', 'Exercice.dc.html', 'Saisir une pièce équilibrée'),
  base('SCR-09', 'Quiz.dc.html', 'Quiz de validation'),
  { screenId: 'SCR-09', state: 'reponse-verifiee', source: 'Quiz.dc.html', setup: async (page) => { await page.getByRole('radio').first().click(); await click(page, 'button', 'Vérifier'); }, expect: (page) => page.getByRole('button', { name: 'Vérifier' }).waitFor({ state: 'hidden' }) },
  base('SCR-10', 'QuizGlobal.dc.html', 'Quiz global'),
  { screenId: 'SCR-10', state: 'micro', source: 'QuizGlobal.dc.html', setup: (page) => click(page, 'button', 'Micro-séance · 5 min'), expect: (page) => page.locator('button[aria-pressed="true"]').filter({ hasText: 'Micro-séance' }).first().waitFor() },
  { screenId: 'SCR-10', state: 'carte-retournee', source: 'QuizGlobal.dc.html', setup: (page) => click(page, 'button', 'Retourner la carte'), expect: (page) => page.getByRole('button', { name: 'Retourner la carte' }).waitFor({ state: 'hidden' }) },
  base('SCR-11', 'ExamenBlanc.dc.html', 'Les règles'),
  { screenId: 'SCR-11', state: 'examen', source: 'ExamenBlanc.dc.html', setup: (page) => click(page, 'button', "Commencer l'examen"), expect: (page) => page.getByRole('heading', { name: 'Les règles' }).waitFor({ state: 'hidden' }) },
  base('SCR-12', 'Agenda.dc.html', 'Novembre 2026'),
  { screenId: 'SCR-12', state: 'jour', source: 'Agenda.dc.html', setup: (page) => click(page, 'button', 'Jour'), expect: (page) => page.getByRole('button', { name: 'Jour précédent' }).waitFor() },
  { screenId: 'SCR-12', state: 'mois', source: 'Agenda.dc.html', setup: (page) => click(page, 'button', 'Mois'), expect: (page) => page.getByRole('button', { name: 'Mois précédent' }).waitFor() },
  base('SCR-13', 'Lacunes.dc.html', 'lacunes'),
  base('SCR-14', 'Carte.dc.html', 'Carte'),

  // SCR-15 — Parametres.dc.html (#profil|notifications|automatismes|modeles)
  base('SCR-15', 'Parametres.dc.html', 'Profil'),
  { screenId: 'SCR-15', state: 'notifications', source: 'Parametres.dc.html#notifications', setup: () => Promise.resolve(), expect: (page) => page.locator('#n-recap').waitFor() },
  { screenId: 'SCR-15', state: 'automatismes', source: 'Parametres.dc.html#automatismes', setup: () => Promise.resolve(), expect: (page) => page.getByRole('heading', { name: 'Mode pause et retour' }).waitFor() },
  { screenId: 'SCR-15', state: 'modeles', source: 'Parametres.dc.html#modeles', setup: (page) => click(page, 'button', 'Ajouter un fournisseur'), expect: (page) => page.locator('#f-model').waitFor() },
];

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

// --- SPEC-4002 — les six étapes du mode simple « Dépose ton cours » -------------------------------
// La planche est `design/mode-simple/index.html` : `#step=0` à `#step=5` (accueil, dépôt, analyse,
// aperçu, diagnostic, premier chapitre) et `#nokey=1` pour l'état « Sans clé d'IA ».

const MODE_SIMPLE = 'design/mode-simple';
const MOBILE = '&view=mobile&plat=ios';
const waitChapter = (page) =>
  page.getByText('La consolidation (introduction)').first().waitFor({ state: 'visible' });

/** Une étape de la planche, capturée en bureau (vue Web) et en mobile (vue Mobile, iOS). */
function modeSimpleStep(screenId, state, step, expect, extra = '', extraRegions = undefined) {
  const hash = `#step=${String(step)}${extra}`;
  return {
    screenId,
    state,
    dir: MODE_SIMPLE,
    zoom: 0.9,
    source: `index.html${hash}`,
    sources: {
      desktop: `index.html${hash}`,
      mobile: `index.html${hash}${MOBILE}`,
    },
    rectSelector: '.page',
    // Sur mobile, la zone utile est le corps de l'écran (`pbody`) : la barre d'état, l'îlot et les
    // onglets du cadre téléphone ne font pas partie de l'écran de l'application.
    mobileRectSelector: '.pbody',
    ...(extraRegions === undefined ? {} : { extraRegions }),
    setup: () => Promise.resolve(),
    expect,
  };
}

export const MODE_SIMPLE_SCENARIOS = [
  // Étape 1 — accueil : les deux portes d'entrée (SCR-03). La vue Web et la vue Mobile ne portent
  // pas le même titre de page : la carte « Dépose ton cours » est commune aux deux. L'accueil de
  // l'application garde le reste de la journée d'apprentissage, que la planche grise : la
  // comparaison porte sur la grille des deux cartes.
  modeSimpleStep(
    'SCR-03',
    'base',
    0,
    (page) => page.getByText('Dépose ton cours').first().waitFor(),
    '',
    { cartes: '.page div[style*="1.25fr"]' },
  ),
  // Étape 2 — dépôt des documents (SCR-21).
  modeSimpleStep('SCR-21', 'base', 1, (page) =>
    page.getByText('Créer ma formation').first().waitFor()),
  // Étape 2 — état bloquant « Sans clé d'IA » (BR-IA-06).
  modeSimpleStep('SCR-21', 'sans-cle', 1, (page) =>
    page.getByText('Ajoute ta clé d’IA pour continuer').waitFor(), '&nokey=1'),
  // Étape 3 — analyse : les chapitres arrivent au fil de l'eau, on attend le dernier (SCR-22).
  modeSimpleStep('SCR-22', 'base', 2, waitChapter),
  // Étape 4 — aperçu du programme (SCR-23).
  modeSimpleStep('SCR-23', 'base', 3, (page) => page.getByText('Programme prêt').waitFor()),
  // Étape 5 — diagnostic global (SCR-24) : le badge « Diagnostic · 10 min » est commun aux vues.
  modeSimpleStep('SCR-24', 'base', 4, (page) => page.getByText('Diagnostic · 10 min').first().waitFor()),
  // Étape 6 — résultat et premier chapitre prêt (SCR-24) : la carte noire du premier chapitre est
  // la zone que l'écran possède (le reste dépend du nombre de modules du document).
  modeSimpleStep(
    'SCR-24',
    'resultat',
    5,
    (page) => page.getByText('Ton premier chapitre est prêt').waitFor(),
    '',
    { 'carte-pret': '.page .dark' },
  ),
];
