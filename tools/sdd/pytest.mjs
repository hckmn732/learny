// Support pytest des validations SDD (SPEC-2003 CA-3).
//
// `validate.mjs` sélectionne les fichiers de test Python qui contiennent « [SPEC-xxxx] », les
// exécute avec pytest et compte les cas depuis le rapport JUnit produit par `--junitxml`. Les
// fonctions de ce module sont pures pour être testées sans venv ni base de données.
export function selectPythonTests(files, kind) {
  return files
    .filter((file) => file.endsWith('.py'))
    .filter((file) => !file.includes('node_modules') && !file.includes('.venv/'))
    .filter((file) =>
      kind === 'integration'
        ? file.includes('/tests/integration/')
        : !file.includes('/tests/integration/'),
    )
    .sort();
}

/** Compte les cas d'un rapport JUnit sans dépendre d'un parseur XML. */
export function parseJunit(xml) {
  const count = (pattern) => (xml.match(pattern) ?? []).length;
  const cases = count(/<testcase\b/g);
  const failures = count(/<failure\b/g);
  const errors = count(/<error\b/g);
  const skipped = count(/<skipped\b/g);
  return {
    cases,
    failures,
    errors,
    skipped,
    passed: Math.max(0, cases - failures - errors - skipped),
  };
}

/** Verdict pytest : neutre sans fichier étiqueté, exigeant dès qu'il y en a un. */
export function pytestVerdict(code, counts, hasFiles) {
  if (!hasFiles) return true;
  return code === 0 && counts.failures === 0 && counts.errors === 0 && counts.passed > 0;
}

/** Ligne de compte rendu de l'étape, Vitest et pytest réunis. */
export function stepSummary(vitestPassed, vitestFailed, python, hasPython) {
  const base = `${vitestPassed} test(s) réussi(s), ${vitestFailed} échec(s)`;
  if (!hasPython) return base;
  return `${base} ; pytest : ${python.passed} réussi(s), ${python.failures + python.errors} échec(s)`;
}
