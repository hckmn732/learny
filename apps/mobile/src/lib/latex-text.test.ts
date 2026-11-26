// [SPEC-4003] Formules LaTeX lisibles sur mobile (QA 2026-11-26).
import { describe, expect, it } from 'vitest';

import { latexToUnicode, withReadableMath } from './latex-text';

describe('[SPEC-4003] formules LaTeX en texte', () => {
  it('rend sommes, indices, exposants et lettres grecques', () => {
    expect(latexToUnicode('T(n) = \\sum_{i=1}^{k} T_i(n)')).toBe('T(n) = ∑ᵢ₌₁ᵏ Tᵢ(n)');
    expect(latexToUnicode('\\Theta(f(n))')).toBe('Θ(f(n))');
    expect(latexToUnicode('\\exists c, \\forall n > n_0 : T(n) \\le c \\times f(n)')).toBe(
      '∃ c, ∀ n > n₀ : T(n) ≤ c × f(n)',
    );
    expect(latexToUnicode('\\frac{n(n+1)}{2}')).toBe('(n(n+1))/2');
    expect(latexToUnicode('O(n^2 \\log n)')).toBe('O(n² log n)');
  });

  it('ne touche qu’aux formules entre dollars', () => {
    expect(withReadableMath('Coût $O(n^2)$ et prix 10 $ HT')).toBe('Coût O(n²) et prix 10 $ HT');
    expect(withReadableMath('sans formule')).toBe('sans formule');
  });
});
