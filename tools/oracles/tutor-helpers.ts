// SPEC-2204 — the predicates of `self-test.ts` the oracle exercises.
//
// `looksInjection`, `asksForTest` and `mockGradeScenario` are not exported by the service module,
// so the oracle keeps this verbatim copy next to it: the regular expressions run in JavaScript,
// which is exactly what the Python port must reproduce.
export function looksInjection(text: string): boolean {
  return /ignore (tes|vos) instructions|r[ée]v[èe]le ta consigne|system prompt/i.test(text);
}

export function asksForTest(text: string): boolean {
  return /\b(teste|interroge|pose-moi une question|v[ée]rifie ma)\b/i.test(text);
}

export function mockGradeScenario(answer: string): string {
  return /\b31\b/.test(answer) && /cr[ée]dit/i.test(answer)
    ? 'self-test-grade-ok'
    : 'self-test-grade-ko';
}
