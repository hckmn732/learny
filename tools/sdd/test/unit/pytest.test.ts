// [SPEC-2003] Sélection et verdict des tests pytest dans validate.mjs (CA-3).
import { describe, expect, it } from 'vitest';

import { parseJunit, pytestVerdict, selectPythonTests, stepSummary } from '../../pytest.mjs';

const FILES = [
  'packages-py/learny/tests/unit/shared/test_jsonx.py',
  'packages-py/learny/tests/integration/db/test_rls.py',
  'apps/api-py/tests/unit/test_relay.py',
  'tools/sdd/validate.mjs',
  'node_modules/pkg/test_unit.py',
  '.venv/lib/python3.13/site-packages/x/test_ignored.py',
];

describe('[SPEC-2003] pytest step of validate.mjs', () => {
  it('splits unit and integration python files and ignores everything else (CA-3)', () => {
    expect(selectPythonTests(FILES, 'unit')).toEqual([
      'apps/api-py/tests/unit/test_relay.py',
      'packages-py/learny/tests/unit/shared/test_jsonx.py',
    ]);
    expect(selectPythonTests(FILES, 'integration')).toEqual([
      'packages-py/learny/tests/integration/db/test_rls.py',
    ]);
  });

  it('counts cases, failures, errors and skips of a JUnit report', () => {
    const xml = [
      '<testsuite tests="4">',
      '  <testcase name="a" />',
      '  <testcase name="b"><failure message="x" /></testcase>',
      '  <testcase name="c"><error /></testcase>',
      '  <testcase name="d"><skipped /></testcase>',
      '</testsuite>',
    ].join('\n');
    expect(parseJunit(xml)).toEqual({ cases: 4, failures: 1, errors: 1, skipped: 1, passed: 1 });
    expect(parseJunit('')).toEqual({ cases: 0, failures: 0, errors: 0, skipped: 0, passed: 0 });
  });

  it('is neutral without tagged file and strict as soon as one exists', () => {
    const clean = { cases: 3, failures: 0, errors: 0, skipped: 0, passed: 3 };
    const broken = { cases: 3, failures: 1, errors: 0, skipped: 0, passed: 2 };
    expect(pytestVerdict(1, broken, false)).toBe(true);
    expect(pytestVerdict(0, clean, true)).toBe(true);
    expect(pytestVerdict(0, broken, true)).toBe(false);
    expect(pytestVerdict(1, clean, true)).toBe(false);
  });

  it('summarises both runtimes', () => {
    const python = { cases: 2, failures: 0, errors: 0, skipped: 0, passed: 2 };
    expect(stepSummary(3, 0, python, false)).toBe('3 test(s) réussi(s), 0 échec(s)');
    expect(stepSummary(3, 0, python, true)).toBe(
      '3 test(s) réussi(s), 0 échec(s) ; pytest : 2 réussi(s), 0 échec(s)',
    );
  });
});
