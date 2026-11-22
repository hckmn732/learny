// Association of the device-agent artifacts to their flow (SPEC-3002, ADR-3012).
//
// The agent used to take one screenshot after the whole campaign and send it under *every* flow
// name: the three visual comparisons then measured the same image and reported the same ratio.
// An artifact now carries the flow it belongs to (`flow`, the directory Maestro writes for it),
// and an artifact without a usable flow is left unassigned instead of being given to the first
// flow, which is exactly the regression this module prevents.

/** Case- and accent-insensitive key: "SPEC-3002 jetons" and "spec-3002-jetons" compare equal. */
function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

/** Flow of an artifact, or `null` when nothing proves which flow produced it. */
function ownerOf(artifact, flows) {
  const tag = normalize(artifact.flow);
  if (tag !== '') {
    const byName = flows.find((flow) => normalize(flow.name) === tag);
    if (byName !== undefined) return byName;
    return flows.find((flow) => normalize(flow.base) === tag) ?? null;
  }
  const name = normalize(artifact.name);
  const matches = flows.filter((flow) => name.includes(normalize(flow.base)));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Groups `artifacts` by flow. `flows` are `{ name, base }` (`name` is Maestro's flow name, `base`
 * the file name without extension). Returns one entry per flow plus the artifacts that could not
 * be attributed.
 */
export function associateArtifacts(artifacts, flows) {
  const entries = new Map(
    flows.map((flow) => [
      flow.base,
      { base: flow.base, name: flow.name, screenshots: [], videos: [] },
    ]),
  );
  const unassigned = [];
  for (const artifact of artifacts ?? []) {
    const owner = ownerOf(artifact, flows);
    if (owner === null) {
      unassigned.push(artifact);
      continue;
    }
    const entry = entries.get(owner.base);
    if (/\.(mp4|mov|webm)$/i.test(String(artifact.name))) entry.videos.push(artifact);
    else entry.screenshots.push(artifact);
  }
  return { entries, unassigned };
}

/**
 * Capture of a visual flow: the screenshot named after the flow file first (`takeScreenshot` of
 * the flow), otherwise the first screenshot of that flow only — never another flow's image.
 */
export function pickCapture(entry) {
  const screenshots = entry?.screenshots ?? [];
  if (screenshots.length === 0) return null;
  const wanted = normalize(entry.base);
  return screenshots.find((shot) => normalize(shot.name).includes(wanted)) ?? screenshots[0];
}
