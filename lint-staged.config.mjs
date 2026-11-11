// Staged-file checks run by the pre-commit hook (SPEC-002, EF-7).
const SDD_TOOLING = /(^|\/)tools\/sdd\//;

const quote = (files) => files.map((f) => JSON.stringify(f)).join(' ');

export default {
  // ESLint never runs on tools/sdd/** (pattern !tools/sdd/**).
  '*.{ts,tsx,mjs,js}': (files) => {
    const linted = files.filter((f) => !SDD_TOOLING.test(f));
    const commands = [];
    if (linted.length > 0) {
      commands.push(`eslint --max-warnings=0 --no-warn-ignored --fix ${quote(linted)}`);
    }
    commands.push(`prettier --write --ignore-unknown ${quote(files)}`);
    return commands;
  },
  '*.{json,md,yml,yaml,css}': (files) => `prettier --write --ignore-unknown ${quote(files)}`,
};
