import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync('specs/catalog.json', 'utf8'));
const brText = fs.readFileSync('docs/product/business-rules.md', 'utf8');
const screenText = fs.readFileSync('docs/product/screens.md', 'utf8');
const apiText = fs.readFileSync('docs/architecture/api.md', 'utf8');
const brs = new Map([...brText.matchAll(/^\| (BR-[A-Z]+-\d+) \| (.*?) \| V[12] \|/gm)].map((m) => [m[1], m[2]]));
const screens = new Map([...screenText.matchAll(/^\| (SCR-\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)].map((m) => [m[1], { title: m[2].trim(), route: m[3].trim(), mockup: m[4].trim() }]));
const phaseDeps = {
  P6: 'Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.',
  P7: 'Les opérations utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201 et le client utilisateur soumis à RLS de SPEC-113. Les dates sont calculées par `@learny/core/time` avec l’horloge injectable ; l’interface réutilise `@learny/ui` et les textes de `apps/web/messages/fr.ts`.',
};
const phaseTech = {
  P6: [
    'Toutes les routes `/api/v1` passent par `handler()` : session obligatoire, validation Zod de l’entrée et de la sortie, erreur `application/problem+json`, `Idempotency-Key` sur les mutations rejouables. Les réponses d’un autre propriétaire sont 404 sans révéler l’existence de l’objet.',
    'Le service applicatif porte les règles métier ; les Server Components lisent un DTO et les composants client ne conservent que l’état interactif. Une écriture sur plusieurs tables est transactionnelle ; l’événement de domaine est émis après commit, au plus une fois par clé d’idempotence.',
    'Les valeurs métier viennent de `packages/config/src/product.ts`; les dates UTC sont projetées dans le fuseau IANA du profil. Les tests fixent `CLOCK_FIXED_AT=2026-11-11T12:20:00Z` et `LLM_MODE=mock`.',
    'Les contenus générés par IA sont validés côté code avant stockage ; les références aux apports sont résolues par identifiant de passage appartenant à l’utilisateur. Aucun SDK fournisseur ni secret n’est importé par l’interface.',
  ],
  P7: [
    'Toutes les routes `/api/v1` passent par `handler()` avec session, schémas Zod, erreur `application/problem+json` et contrôle RLS. Les mutations sont idempotentes lorsqu’elles peuvent être répétées par le navigateur, un job ou un événement.',
    'Le service applicatif conserve la source de vérité en base ; l’interface affiche les DTO et invalide ses lectures après mutation. Les événements sont émis après transaction. Une action d’automatisme porte une clé de déduplication, son explication et un état journalisé.',
    'Les horaires sont calculés dans le fuseau IANA du profil avec l’horloge injectable ; aucune règle n’utilise `Date.now()` directement. Les tests fixent le 11 novembre 2026 à 13:20 à Paris et les intégrations IA en mode mock.',
    'Les libellés fixes restent en français et au vouvoiement ; le texte rédigé par le tuteur suit le ton du profil. Toute vue asynchrone a un état chargement, vide et erreur avec action de reprise.',
  ],
};

function slug(s) { return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50); }
function clean(s) { return s.replace(/\s+/g, ' ').trim().replace(/[.;]$/, ''); }
function withPeriod(s) { return /[.!?]$/.test(s) ? s : `${s}.`; }
function scopeParts(scope) {
  let parts = scope.split(/;\s*/).flatMap((x) => x.split(/,\s+(?=[A-ZÀÉÈÊÎÔÛ«])/));
  parts = parts.map(clean).filter((x) => x.length > 10);
  if (parts.length < 3) parts = scope.split(/,\s*/).map(clean).filter((x) => x.length > 10);
  return parts.length ? parts : [clean(scope)];
}
function adrDecisions(spec) {
  return spec.adrs.map((id) => {
    const file = fs.readdirSync('docs/adr').find((f) => f.startsWith(`${id}-`));
    if (!file) return `- **${id}** — à créer avant l’implémentation ; ne pas substituer une hypothèse.`;
    const txt = fs.readFileSync(path.join('docs/adr', file), 'utf8');
    const title = txt.match(/^# .*? — (.+)$/m)?.[1] ?? id;
    const decision = clean((txt.split('## Décision')[1] ?? '').split('## Conséquences')[0] ?? '').slice(0, 680);
    return `- **${id} — ${title}** : ${withPeriod(decision)}`;
  });
}
function sourcePaths(s) {
  const scope = s.scope;
  const matches = [...scope.matchAll(/(?:packages|apps|docs|design|supabase|docker|tools)\/[\w./*-]+/g)].map((m) => m[0].replace(/[.,;)]$/, ''));
  return [...new Set(matches)];
}
function serviceBase(s) {
  const domain = s.phase === 'P7' && /Automatisme|automatismes/.test(s.title) ? 'packages/automations/src' : 'packages/services/src';
  return `${domain}/${slug(s.title)}.ts`;
}
function relatedApis(s) {
  return apiText.split('\n').filter((line) => line.startsWith('|') && line.includes(s.id)).slice(0, 5).map((line) => clean(line.split('|')[1]));
}
function visualText(s) {
  const scr = s.screens.map((id) => ({ id, ...screens.get(id) })).filter((x) => x.title);
  if (s.visual === 'demo') return `Mode **demo** : la page \`/_dev/sdd/${s.id}\` démontre la capacité avec des données de test lisibles, son résultat calculé et ses erreurs. Elle est inaccessible en production (ADR-0049). Vérifier les régions, les jetons, axe et \`toHaveScreenshot\` (écart ≤ 1 %) aux viewports desktop et mobile.`;
  if (s.visual === 'tokens') return `Mode **tokens**. ${scr.map((x) => `${x.id} (${x.title}) suit la route ${x.route}`).join(' ; ')}. Composer l’écran selon \`docs/product/screens.md\` §3 avec les composants de \`@learny/ui\`; vérifier régions, ordre, textes, états chargement/vide/erreur, axe et \`toHaveScreenshot\` (écart ≤ 1 %) aux viewports desktop et mobile.`;
  return `Mode **mockup**. ${scr.map((x) => `${x.id} (${x.title}) : route ${x.route}, maquette ${x.mockup}`).join(' ; ')}. Reprendre l’ordre des régions et les textes de la maquette, ainsi que les états nécessaires au parcours décrit en section 5. À l’horloge figée et avec le jeu SPEC-115, vérifier \`expectTokens\`, la structure, \`compareWithReference\` (écart ≤ 12 %), axe sans violation serious/critical et \`toHaveScreenshot\` (écart ≤ 1 %) en desktop/mobile.`;
}

const assigned = catalog.specs.filter((s) => (s.phase === 'P6' && (s.id >= 'SPEC-605' && s.id <= 'SPEC-609' || s.id >= 'SPEC-613' && s.id <= 'SPEC-618')) || (s.phase === 'P7' && (s.id >= 'SPEC-705' && s.id <= 'SPEC-711' || s.id >= 'SPEC-717' && s.id <= 'SPEC-725')));
for (const s of assigned) {
  if (fs.existsSync(s.path)) continue;
  const parts = scopeParts(s.scope);
  const routes = relatedApis(s);
  const base = serviceBase(s);
  const testUnit = base.replace(/\.ts$/, '.test.ts');
  const testInt = `packages/services/test/integration/${slug(s.title)}.test.ts`;
  const testE2e = `apps/web/e2e/specs/${s.phase.toLowerCase()}/${s.id.toLowerCase()}.spec.ts`;
  const screenInfo = s.screens.map((id) => `${id} : ${screens.get(id)?.route ?? 'route du catalogue'}`).join(' ; ');
  const brLines = s.businessRules.map((id) => `- **${id}** — ${withPeriod(brs.get(id) ?? 'Règle référencée dans le catalogue ; consulter business-rules.md')}`);
  const ef = parts.map((p, i) => `- **EF-${i + 1}** — ${withPeriod(p)}`);
  let nextEf = ef.length + 1;
  for (const id of s.businessRules) ef.push(`- **EF-${nextEf++}** — Appliquer intégralement ${id} : ${withPeriod(brs.get(id) ?? '')}`);
  const ca = [
    `- **CA-1** — Le parcours principal « ${s.title} » réalise les capacités suivantes sur une ressource appartenant à l’apprenant : ${parts.slice(0, 3).map(clean).join(' ; ')}. Les données persistent après rechargement de la page.`,
    `- **CA-2** — ${s.businessRules.length ? `Les règles ${s.businessRules.join(', ')} sont vérifiées avec leurs défauts, bornes et textes exacts ; un cas en deçà et un cas au delà de chaque borne sont refusés ou gérés comme indiqué.` : 'Le contrat de la capacité respecte les états et valeurs décrits aux sections 5 et 6, y compris un cas vide et une entrée invalide.'}`,
    `- **CA-3** — Un utilisateur distinct ne peut ni lire ni modifier l’objet du premier ; une double soumission n’entraîne pas deux écritures ni deux événements ; les erreurs restent lisibles sans fuite de données.`,
    `- **CA-4** — ${s.visual === 'mockup' ? 'L’écran reprend les régions, états et textes de la maquette ; écart de pixels ≤ 12 % contre la référence.' : 'La page suit les jetons et les régions prescrites ; le résultat affiché provient de la capacité exécutée.'} Le contrôle axe ne trouve aucune violation serious/critical et la ligne de base visuelle reste ≤ 1 %.`,
    `- **CA-5** — Les tests unitaires, d’intégration et e2e étiquetés ${s.id} passent avec vidéo et une preuve pour chacun des quatre autres critères dans \`evidence/${s.id}/acceptance.md\`.`,
  ];
  const body = `---\nid: ${s.id}\ntitle: ${JSON.stringify(s.title)}\nphase: ${s.phase}\npriority: ${s.priority}\ndepends_on: [${s.dependsOn.join(', ')}]\nbusiness_rules: [${s.businessRules.join(', ')}]\nscreens: [${s.screens.join(', ')}]\nadrs: [${s.adrs.join(', ')}]\nvisual: ${s.visual}\n---\n\n# ${s.id} — ${s.title}\n\n## 1. Objectif\n\n${withPeriod(s.scope)} Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.\n\n## 2. Contexte\n\nLire \`docs/product/vision.md\`, \`docs/product/business-rules.md\`, \`docs/product/screens.md\`, \`docs/architecture/overview.md\`, \`docs/architecture/data-model.md\`, \`docs/architecture/api.md\`, \`docs/engineering/conventions.md\` et \`docs/engineering/testing.md\`. ${screenInfo ? `Écran concerné : ${screenInfo}.` : 'La capacité est montrée sur une page SDD hors production.'} Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.\n\n## 3. Dépendances\n\n${s.dependsOn.map((id) => `- **${id}** — ${catalog.specs.find((x) => x.id === id)?.title ?? 'Spécification du catalogue'} ; réutiliser ses contrats publics, schémas et services sans les dupliquer.`).join('\n')}\n- **Architecture transversale** — ${phaseDeps[s.phase]}\n- **Services externes** — Les tests utilisent Supabase local et \`LLM_MODE=mock\`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon \`sdd-process.md\` §3, sans inventer de résultat.\n\n## 4. Règles métier couvertes\n\n${brLines.join('\n') || 'Aucune règle métier directe ; la capacité applique les conventions transverses du référentiel.'}\n\n## 5. Exigences fonctionnelles\n\n${ef.join('\n')}\n- **EF-${nextEf}** — L’interface ou la page SDD présente un état de chargement, un état vide, le résultat et une erreur avec action « Réessayer ». Toute action rejouable résiste au double clic, à la reprise et au rechargement.\n\n## 6. Exigences techniques\n\n${phaseTech[s.phase].map((t, i) => `- **ET-${i + 1}** — ${t}`).join('\n')}\n- **ET-5** — Code principal dans \`${base}\` ; contrat d’entrée/sortie dans \`packages/contracts/src/${slug(s.title)}.ts\`. Valider les identifiants, les valeurs et les états autorisés avant tout effet ; exposer des fonctions nommées selon les capacités EF-1 à EF-${nextEf}. Les DTO ne contiennent que les champs nécessaires à l’écran.\n- **ET-6** — ${routes.length ? `Routes prévues par \`docs/architecture/api.md\` : ${routes.join(' ; ')}. Conserver leurs méthodes et chemins ; ajouter au tableau toute route nouvelle dans le même changement.` : 'Si une route API est nécessaire, utiliser le préfixe `/api/v1`, la documenter dans `docs/architecture/api.md` et la tester avec un appel HTTP réel.'}\n- **ET-7** — Exporter des erreurs typées stables pour entrée invalide, ressource absente, conflit, indisponibilité externe et permission refusée. Ne jamais renvoyer au client une clé, un jeton, un contenu d’apport privé ou la pile d’une exception.\n\n## 7. Comportements attendus et cas limites\n\n- **CL-1** — Donnée initiale vide : afficher l’état vide et l’action pertinente sans créer d’objet factice.\n- **CL-2** — Entrée hors schéma ou identifiant mal formé : 400 \`VALIDATION_FAILED\` ; aucune écriture ou émission d’événement.\n- **CL-3** — Ressource inexistante ou appartenant à un autre utilisateur : 404 ; la réponse ne révèle pas son existence.\n- **CL-4** — Même mutation envoyée deux fois : une seule transition et un seul événement ; une mutation concurrente incompatible reçoit 409 \`CONFLICT\`.\n- **CL-5** — Rechargement ou réseau lent : restituer l’état persisté, garder l’action principale désactivée pendant la requête et présenter « Réessayer » après un échec récupérable.\n- **CL-6** — Fournisseur IA ou autre service externe indisponible : afficher le code métier prévu, préserver les données déjà validées et ne jamais déclarer une tâche terminée sans résultat.\n- **CL-7** — Date au bord d’un jour local ou changement d’heure : utiliser le fuseau du profil et l’horloge injectable ; la même entrée de test produit le même résultat.\n\n## 8. Instructions d'implémentation\n\n1. Relire les contrats des dépendances et les règles ${s.businessRules.join(', ') || 'transverses'} ; définir les schémas Zod et types DTO dans \`packages/contracts/src/${slug(s.title)}.ts\`. Ajouter les valeurs métier à \`packages/config/src/product.ts\` uniquement si elles viennent d’une règle ou d’un ADR. Commit \`feat(${s.id}): définit les contrats\`.\n2. Écrire \`${base}\` et ses fonctions pures d’aide ; toute écriture multi-tables est transactionnelle. Utiliser l’horloge injectée et le client RLS. Commit \`feat(${s.id}): implémente la capacité\`.\n3. Brancher les routes documentées, les événements après commit et les composants ou la page SDD. Réutiliser \`@learny/ui\` et ajouter les libellés à \`apps/web/messages/fr.ts\`. Commit \`feat(${s.id}): expose le parcours\`.\n4. Couvrir chaque EF et CL par les tests section 12 ; utiliser les fixtures du jeu SPEC-115, l’IA mock et l’horloge figée. Créer la référence de non-régression sans toucher aux maquettes. Commit \`test(${s.id}): vérifie le parcours et les limites\`.\n5. Exécuter \`node tools/sdd/validate.mjs ${s.id}\`, corriger les erreurs, lier les preuves réelles aux CA dans \`evidence/${s.id}/acceptance.md\` puis terminer avec \`complete.mjs\`.\n\n## 9. Fichiers et composants concernés\n\n- **Créés** : \`packages/contracts/src/${slug(s.title)}.ts\`, \`${base}\`, \`${testUnit}\`, \`${testInt}\`, \`${testE2e}\`${s.visual === 'demo' ? `, \`apps/web/components/sdd-demos/${s.id.toLowerCase()}.tsx\`` : ''}.\n- **Modifiés** : \`apps/web/messages/fr.ts\`, exports des paquets, routes \`apps/web/app/api/v1/**\` correspondant à ET-6, composants de l’écran ${s.screens.join(', ') || 'SDD'}, catalogue d’événements si la capacité en émet.\n- **Lus / réutilisés** : ${[...sourcePaths(s), ...s.dependsOn.map((id) => catalog.specs.find((x) => x.id === id)?.path)].filter(Boolean).map((x) => `\`${x}\``).join(', ') || '`docs/architecture/overview.md`'}.\n\n## 10. Interface et conformité visuelle\n\n${visualText(s)}\n\n- **Structure** — En-tête « ${s.title} », puis les régions correspondant à ${parts.slice(0, 4).map((p) => `« ${clean(p).slice(0, 60)} »`).join(', ')} ; ordre et textes confrontés à la maquette ou aux règles de \`screens.md\`. Les éléments interactifs portent des noms accessibles et des \`data-testid\` stables ; focus restauré après fermeture d’un panneau et annonces \`aria-live\` pour les changements.\n- **États** — Chargement, vide, résultat, erreur et permission refusée sont distingués en texte, sans dépendre de la seule couleur. À 390 px, aucune région ne sort du viewport et les contrôles restent atteignables au clavier.\n\n## 11. Critères d'acceptation\n\n${ca.join('\n')}\n\n## 12. Plan de tests\n\n- **Unitaires** — \`${testUnit}\`, \`describe('[${s.id}] ${slug(s.title)}')\` : calculs et schémas des EF-1 à EF-${nextEf}, bornes des ${s.businessRules.join(', ') || 'entrées'}, cas vide, conflit et fuseau ; résultats attendus issus des règles section 4 (CA-1, CA-2).\n- **Intégration** — \`${testInt}\`, \`describe('[${s.id}] integration')\` : base Supabase locale, transaction complète, rechargement, idempotence, deuxième utilisateur/RLS, service externe mock et codes 400/404/409 (CA-1, CA-2, CA-3).\n- **End-to-end** — \`${testE2e}\`, \`test('parcours ${slug(s.title)} @${s.id}')\` : ouvrir ${screenInfo || `/_dev/sdd/${s.id}`}, exercer l’action principale, attendre le résultat persisté, recharger, vérifier les données, enregistrer une vidéo et lancer axe (CA-1, CA-3, CA-4).\n- **Visuel** — \`test('conformité ${s.id} @${s.id} @visual')\` : jetons, structure, état de référence, ${s.visual === 'mockup' ? 'écart maquette ≤ 12 % et ' : ''}capture \`toHaveScreenshot\` ≤ 1 % en desktop/mobile (CA-4).\n- **Non-régression** — rejouer les étiquettes des dépendances ${s.dependsOn.map((id) => `\`@${id}\``).join(', ')} et les suites complètes unitaires/intégration.\n\n| Critère | Tests |\n|---|---|\n| CA-1 | unitaires EF ; intégration transaction ; e2e parcours |\n| CA-2 | unitaires bornes ; intégration entrées invalides |\n| CA-3 | intégration RLS/idempotence ; e2e reprise |\n| CA-4 | e2e axe et \`@visual\` |\n| CA-5 | rapports filtrés et \`acceptance.md\` |\n\n## 13. Preuves attendues\n\n\`evidence/${s.id}/\` : \`unit.json\`, \`integration.json\`, \`e2e.json\`, \`e2e.xml\`, \`checks.json\`, vidéo Playwright, captures desktop/mobile, comparaison de référence pour le mode mockup, \`acceptance.md\` avec une ligne ✅ et une preuve vérifiable par CA. Un résultat de test manquant, une vidéo absente ou une différence visuelle excessive fait échouer la validation ; ne jamais écrire une preuve à la main.\n\n## 14. Définition de terminé\n\nToutes les validations de \`docs/engineering/testing.md\` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, \`@visual\`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.\n\n## 15. Décisions et hypothèses\n\n${adrDecisions(s).join('\n') || '- Aucun ADR spécifique dans le catalogue ; les règles métier, conventions et documents d’architecture cités sont appliqués sans nouveau choix de produit.'}\n- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit \`docs/engineering/sdd-process.md\` §4 et produit un ADR avant modification du périmètre.\n`;
  fs.mkdirSync(path.dirname(s.path), { recursive: true });
  fs.writeFileSync(s.path, body, 'utf8');
  console.log(s.id, s.path, body.split(/\s+/).length);
}


