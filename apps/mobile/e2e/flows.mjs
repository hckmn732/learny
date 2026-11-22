// En-tête d'un flux Maestro, sans dépendance YAML (SPEC-3001 EF-5, ADR-3015 § 3).
//
// Le lanceur et l'agent ont besoin du `name:` et des `tags:` d'un flux pour l'appariement des
// artefacts et la lecture du rapport JUnit. Ces en-têtes sont volontairement simples (Maestro
// n'accepte qu'une liste de chaînes), d'où cette lecture ligne à ligne plutôt qu'une dépendance
// YAML dans l'outillage e2e.

/**
 * Lit l'en-tête d'un flux : `{ name, tags, appId, content }`.
 * Les `tags:` d'un document Maestro sont une liste YAML sous l'en-tête, fermée par `---`.
 */
export function parseFlowHeader(content) {
  const lines = String(content ?? '').split('\n');
  const nameLine = lines.find((line) => line.startsWith('name:'));
  const name = nameLine === undefined ? '' : nameLine.slice('name:'.length).trim();
  const tags = [];
  let inTags = false;
  for (const line of lines) {
    // The YAML document separator closes the header (`---`).
    if (line.trim() === '---') {
      inTags = false;
      continue;
    }
    if (/^tags:\s*$/.test(line)) {
      inTags = true;
      continue;
    }
    if (inTags) {
      const match = /^\s*-\s*(.+?)\s*$/.exec(line);
      const tag = match?.[1]?.replace(/^["']|["']$/g, '') ?? '';
      // Only real labels: the document separator and comments are not tags.
      if (tag !== '' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) {
        tags.push(tag);
        continue;
      }
      inTags = false;
    }
  }
  const appIdLine = lines.find((line) => line.startsWith('appId:'));
  return {
    name,
    tags,
    appId: appIdLine === undefined ? '' : appIdLine.slice('appId:'.length).trim(),
    content: String(content ?? ''),
  };
}
