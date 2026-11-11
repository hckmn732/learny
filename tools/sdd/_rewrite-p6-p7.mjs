import fs from 'node:fs';
import { extras } from './_enrich-p6-p7.mjs';

const catalog = JSON.parse(fs.readFileSync('specs/catalog.json', 'utf8'));
const phaseCommon = {
  P6: [
    'Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.',
    'Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.',
  ],
  P7: [
    'Les routes API valident entrée/sortie avec Zod et appellent un service soumis à RLS ; un objet d’un autre utilisateur répond 404. Les mutations rejouables portent une clé d’idempotence.',
    'Les actions et notifications sont écrites dans une transaction puis émises après commit ; l’horloge injectable et le fuseau IANA du profil déterminent les échéances et les semaines locales.',
  ],
};
function list(type, items) { return items.map((x, i) => `- **${type}-${i + 1}** — ${x}`).join('\n'); }
function replaceSection(txt, n, content) {
  const start = txt.search(new RegExp(`^## ${n}\\. `, 'm'));
  const end = txt.search(new RegExp(`^## ${n + 1}\\. `, 'm'));
  if (start < 0 || end < 0) throw new Error(`section ${n} absente`);
  const heading = txt.slice(start, txt.indexOf('\n', start));
  return `${txt.slice(0, start)}${heading}\n\n${content.trim()}\n\n${txt.slice(end)}`;
}
for (const [id, d] of Object.entries(extras)) {
  const s = catalog.specs.find((x) => x.id === id);
  let txt = fs.readFileSync(s.path, 'utf8');
  const ef = [...d.ef, `Les règles métier ${s.businessRules.join(', ') || 'transverses'} de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.`];
  txt = replaceSection(txt, 5, list('EF', ef));
  const et = [...phaseCommon[s.phase], ...d.et];
  txt = replaceSection(txt, 6, list('ET', et));
  const cl = [
    'Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.',
    'Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.',
    ...d.cl,
  ];
  txt = replaceSection(txt, 7, list('CL', cl));
  const mode = s.visual;
  const visual = `${d.visual}\n\n- **Contrôles** — ${mode === 'mockup' ? `Utiliser la référence du ${s.screens.join(', ')} dans \`design/references/\` et mesurer ≤ 12 % de pixels différents ; ` : ''}vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base \`toHaveScreenshot\` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.`;
  txt = replaceSection(txt, 10, visual);
  const ca = [...d.ca, `Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.`, `${mode === 'mockup' ? 'L’écran respecte la maquette avec un écart ≤ 12 % ; ' : 'La démonstration suit les jetons et la structure prescrits ; '}axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.`];
  txt = replaceSection(txt, 11, list('CA', ca));
  const base = s.phase.toLowerCase();
  const unit = `packages/services/src/${id.toLowerCase()}.test.ts`;
  const int = `packages/services/test/integration/${id.toLowerCase()}.test.ts`;
  const e2e = `apps/web/e2e/specs/${base}/${id.toLowerCase()}.spec.ts`;
  const mainCa = d.ca.map((x, i) => `CA-${i + 1} : ${x}`).join(' ; ');
  const tests = [
    `- **Unitaires** — \`${unit}\`, \`describe('[${id}] règles et calculs')\` : pour ${mainCa} Tester aussi valeurs limites, entrée vide, ordre déterministe et fuseau si le comportement dépend du temps.`,
    `- **Intégration** — \`${int}\`, \`describe('[${id}] service et API')\` : exécuter les mêmes cas sur Supabase local avec \`LLM_MODE=mock\`, vérifier les lignes et événements réellement écrits, puis 400, 404 RLS, 409 et double envoi (CA-${ca.length - 1}).`,
    `- **End-to-end** — \`${e2e}\`, \`test('parcours ${id} @${id}')\` : partir du seed SPEC-115, ouvrir ${s.screens.join(', ') || `/_dev/sdd/${id}`}, effectuer les actions des CA-1 à CA-${d.ca.length}, recharger, contrôler le résultat et conserver la vidéo. Tester l’état erreur et lancer axe.`,
    `- **Visuel** — \`test('conformité ${id} @${id} @visual')\` : jetons, régions, textes, ${mode === 'mockup' ? 'comparaison de référence ≤ 12 %, ' : ''}captures desktop/mobile ≤ 1 % et axe (CA-${ca.length}).`,
    `- **Non-régression** — Rejouer les étiquettes ${s.dependsOn.map((x) => `\`[${x}]\` et \`@${x}\``).join(', ')} en plus des suites unitaires/intégration complètes.`,
    '',
    '| Critère | Tests |',
    '|---|---|',
    ...ca.map((_, i) => `| CA-${i + 1} | ${i < d.ca.length ? 'unitaires ciblés ; intégration service ; e2e parcours' : i === ca.length - 2 ? 'intégration RLS, invalides et idempotence' : `e2e et \`@${id} @visual\``} |`),
  ].join('\n');
  txt = replaceSection(txt, 12, tests);
  const evidence = `\`evidence/${id}/\` contient les rapports réels \`unit.json\`, \`integration.json\`, \`e2e.json\`, \`e2e.xml\`, \`checks.json\`, au moins une vidéo Playwright, les captures finales et \`acceptance.md\` avec preuve vérifiable pour CA-1 à CA-${ca.length}. ${mode === 'mockup' ? 'Conserver la comparaison côte à côte et le diff avec la référence de maquette.' : 'Conserver la capture de la page de démonstration ou de l’écran sans maquette.'} Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.`;
  txt = replaceSection(txt, 13, evidence);
  fs.writeFileSync(s.path, txt, 'utf8');
  console.log(id, txt.split(/\s+/).length);
}
