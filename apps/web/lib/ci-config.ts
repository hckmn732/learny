// Read-only view of the real GitHub Actions configuration for the SPEC-011 demo page.
// Nothing is written and no run result is invented: the page shows the workflow files of the
// repository, never a remote status (SPEC-011, EF-9).
import {
  describeCi,
  readWorkflows,
  type DescribedCi,
  type ReadWorkflowsResult,
} from '../../../tools/ci/check-workflows.mjs';

import { findRepoRoot } from './sdd-status';

export type CiSnapshot = DescribedCi & { available: boolean };

const EMPTY: ReadWorkflowsResult = {
  root: '',
  ci: null,
  ciRaw: null,
  prTitle: null,
  prTitleRaw: null,
  parseErrors: [],
};

/** Parses `.github/workflows/ci.yml` and `pr-title.yml`; falls back to an empty snapshot. */
export function readCiConfig(root: string | null = findRepoRoot()): CiSnapshot {
  const workflows = root === null ? EMPTY : readWorkflows(root);
  const described = describeCi(workflows);
  return {
    ...described,
    available: workflows.ci !== null && described.jobs.length > 0,
  };
}
