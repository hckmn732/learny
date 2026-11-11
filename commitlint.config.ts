import { commitlintPlugin, commitlintRules } from './packages/config/src/commit-rules';

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [commitlintPlugin],
  rules: commitlintRules,
  defaultIgnores: true,
};
