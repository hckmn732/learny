// LaTeX mathematics of the courses and quizzes as readable Unicode text (QA 2026-11-26).
//
// The web typesets `$…$` and `$$…$$` with KaTeX; the application has no WebView to do the same, so
// the formulas are turned into plain text: `$T(n) = \sum_{i=1}^{k} T_i(n)$` reads
// `T(n) = ∑ᵢ₌₁ᵏ Tᵢ(n)`. Unknown commands keep their name without the backslash; nothing throws.

const SYMBOLS: Readonly<Record<string, string>> = {
  sum: '∑',
  prod: '∏',
  int: '∫',
  oint: '∮',
  infty: '∞',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  ll: '≪',
  gg: '≫',
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  mp: '∓',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  iff: '⇔',
  implies: '⇒',
  mapsto: '↦',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  emptyset: '∅',
  varnothing: '∅',
  setminus: '∖',
  approx: '≈',
  sim: '∼',
  simeq: '≃',
  equiv: '≡',
  propto: '∝',
  neg: '¬',
  lnot: '¬',
  land: '∧',
  wedge: '∧',
  lor: '∨',
  vee: '∨',
  oplus: '⊕',
  otimes: '⊗',
  partial: '∂',
  nabla: '∇',
  sqrt: '√',
  ldots: '…',
  dots: '…',
  cdots: '⋯',
  vdots: '⋮',
  lfloor: '⌊',
  rfloor: '⌋',
  lceil: '⌈',
  rceil: '⌉',
  langle: '⟨',
  rangle: '⟩',
  mid: '|',
  vert: '|',
  Vert: '‖',
  circ: '∘',
  bullet: '•',
  star: '⋆',
  degree: '°',
  prime: '′',
  log: 'log',
  ln: 'ln',
  lg: 'lg',
  exp: 'exp',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  max: 'max',
  min: 'min',
  lim: 'lim',
  sup: 'sup',
  inf: 'inf',
  det: 'det',
  gcd: 'pgcd',
  mod: 'mod',
  bmod: 'mod',
  quad: '  ',
  qquad: '    ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

/** Commands whose argument is kept as plain text (`\text{si}` → `si`). */
const TEXT_COMMANDS = new Set([
  'text',
  'textrm',
  'textbf',
  'textit',
  'mathrm',
  'mathbf',
  'mathit',
  'mathcal',
  'mathbb',
  'mathsf',
  'operatorname',
  'boldsymbol',
]);

/** Spacing and sizing commands that print nothing. */
const SILENT = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'displaystyle', 'limits']);

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
  k: 'ᵏ',
  m: 'ᵐ',
  x: 'ˣ',
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  j: 'ʲ',
  p: 'ᵖ',
  t: 'ᵗ',
  '∗': '*',
  '*': '*',
};

const SUBSCRIPT: Readonly<Record<string, string>> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  x: 'ₓ',
};

/** The group at `start` (`{…}` with nesting, or one character / one command) and its end. */
function readGroup(source: string, start: number): { body: string; end: number } {
  let index = start;
  while (source[index] === ' ') index += 1;
  if (source[index] === '{') {
    let depth = 0;
    for (let cursor = index; cursor < source.length; cursor += 1) {
      if (source[cursor] === '{') depth += 1;
      if (source[cursor] === '}') {
        depth -= 1;
        if (depth === 0) return { body: source.slice(index + 1, cursor), end: cursor + 1 };
      }
    }
    return { body: source.slice(index + 1), end: source.length };
  }
  if (source[index] === '\\') {
    const match = /^\\([A-Za-z]+|.)/u.exec(source.slice(index));
    const length = match?.[0].length ?? 1;
    return { body: source.slice(index, index + length), end: index + length };
  }
  return { body: source.slice(index, index + 1), end: index + 1 };
}

function script(text: string, table: Readonly<Record<string, string>>, marker: string): string {
  const chars = Array.from(text);
  if (chars.length > 0 && chars.every((char) => table[char] !== undefined)) {
    return chars.map((char) => table[char]).join('');
  }
  return chars.length === 1 ? `${marker}${text}` : `${marker}(${text})`;
}

function needsParentheses(text: string): boolean {
  return Array.from(text).length > 1 && !/^[\p{L}\p{N}]+$/u.test(text);
}

/** One LaTeX formula as Unicode text. */
export function latexToUnicode(tex: string): string {
  let out = '';
  let index = 0;
  while (index < tex.length) {
    const char = tex[index] ?? '';
    if (char === '\\') {
      const match = /^\\([A-Za-z]+|.)/u.exec(tex.slice(index));
      const name = match?.[1] ?? '';
      index += match?.[0].length ?? 1;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const numerator = readGroup(tex, index);
        const denominator = readGroup(tex, numerator.end);
        index = denominator.end;
        const top = latexToUnicode(numerator.body);
        const bottom = latexToUnicode(denominator.body);
        out += `${needsParentheses(top) ? `(${top})` : top}/${needsParentheses(bottom) ? `(${bottom})` : bottom}`;
      } else if (name === 'sqrt') {
        const radicand = readGroup(tex, index);
        index = radicand.end;
        const inner = latexToUnicode(radicand.body);
        out += needsParentheses(inner) ? `√(${inner})` : `√${inner}`;
      } else if (TEXT_COMMANDS.has(name)) {
        const argument = readGroup(tex, index);
        index = argument.end;
        out += latexToUnicode(argument.body);
      } else if (SILENT.has(name)) {
        // printed as nothing
      } else if (name === ',' || name === ';' || name === ':' || name === ' ' || name === '!') {
        out += name === '!' ? '' : ' ';
      } else if (
        name === '{' ||
        name === '}' ||
        name === '%' ||
        name === '$' ||
        name === '&' ||
        name === '_' ||
        name === '#'
      ) {
        out += name;
      } else if (name === '\\') {
        out += '\n';
      } else {
        out += SYMBOLS[name] ?? name;
      }
      continue;
    }
    if (char === '^' || char === '_') {
      const group = readGroup(tex, index + 1);
      index = group.end;
      const inner = latexToUnicode(group.body).replace(/\s+/gu, '');
      out += script(inner, char === '^' ? SUPERSCRIPT : SUBSCRIPT, char);
      continue;
    }
    if (char === '{' || char === '}') {
      index += 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out.replace(/ {2,}/gu, ' ');
}

const FORMULA = /\$\$([^$]+)\$\$|\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/gu;

/** A text with its `$…$` and `$$…$$` formulas turned into Unicode; the rest is untouched. */
export function withReadableMath(text: string): string {
  if (!text.includes('$')) return text;
  return text.replace(FORMULA, (_whole, display: string | undefined, inline: string | undefined) =>
    latexToUnicode((display ?? inline ?? '').trim()),
  );
}
