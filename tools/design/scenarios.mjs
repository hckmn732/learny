// Table versionnée des états de maquettes capturés en référence (SPEC-005, EF-2, ET-2).
// Chaque scénario part d'un contexte neuf ; `setup` atteint l'état par l'interface, `expect` vérifie
// une condition observable avant la capture. Aucune temporisation fixe, aucun clic aveugle.

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
  base('SCR-04', 'NouvelleFormation.dc.html', 'formation'),
  base('SCR-05', 'Programme.dc.html', 'Modules et chapitres'),
  { screenId: 'SCR-05', state: 'proposition', source: 'Programme.dc.html?proposition', setup: () => Promise.resolve(), expect: (page) => page.locator('button[aria-expanded="true"]').filter({ hasText: /^\s*1/ }).first().waitFor() },
  base('SCR-06', 'Module.dc.html', 'Comptabilité générale'),
  base('SCR-07', 'Cours.dc.html', ''),
  base('SCR-08', 'Exercice.dc.html', 'Saisir une pièce équilibrée'),
  base('SCR-09', 'Quiz.dc.html', 'Quiz de validation'),
  { screenId: 'SCR-09', state: 'reponse-verifiee', source: 'Quiz.dc.html', setup: async (page) => { await page.getByRole('radio').first().click(); await click(page, 'button', 'Vérifier'); }, expect: (page) => page.getByRole('button', { name: 'Vérifier' }).waitFor({ state: 'hidden' }) },
  base('SCR-10', 'QuizGlobal.dc.html', 'Quiz global'),
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
