// Safe, sandboxed arithmetic expression evaluator for Quest reward / damage formulas.
// Variables: `base`, `streak`, `neglect`, `age`, `coins`. NEVER use Function/eval here — only an
// explicit recursive-descent parser so the surface area is small and deterministic. Identifiers
// and functions outside the allowlist throw.
//
// Variable semantics by formula slot:
//   - Daily reward: `streak` is the consecutive-completion count entering today; `age` is 0.
//   - Todo reward:  `age` is whole days since task creation (in the user's effective date);
//                   `streak` is 0.
//   - Damage:       `neglect` is the consecutive-miss count (incremented for the miss in flight).

export interface FormulaContext {
  base: number;
  streak: number;
  neglect: number;
  age: number;
  coins: number;
}

const ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
  sqrt: Math.sqrt,
  pow: Math.pow,
  log: Math.log,
};

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < input.length && ((input[j] >= '0' && input[j] <= '9') || input[j] === '.')) j++;
      const num = Number(input.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`Invalid number at position ${i}`);
      tokens.push({ kind: 'num', value: num });
      i = j;
      continue;
    }
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let j = i;
      while (
        j < input.length &&
        ((input[j] >= 'a' && input[j] <= 'z') ||
          (input[j] >= 'A' && input[j] <= 'Z') ||
          (input[j] >= '0' && input[j] <= '9') ||
          input[j] === '_')
      )
        j++;
      tokens.push({ kind: 'ident', value: input.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%' || ch === '^') {
      tokens.push({ kind: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i++;
      continue;
    }
    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[], private readonly ctx: FormulaContext) {}

  evaluate(): number {
    const v = this.parseAddSub();
    if (this.pos < this.tokens.length) {
      throw new Error('Unexpected trailing tokens');
    }
    return v;
  }

  // + -
  private parseAddSub(): number {
    let left = this.parseMulDiv();
    while (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      if (t.kind !== 'op' || (t.value !== '+' && t.value !== '-')) break;
      this.pos++;
      const right = this.parseMulDiv();
      left = t.value === '+' ? left + right : left - right;
    }
    return left;
  }

  // * / %
  private parseMulDiv(): number {
    let left = this.parsePow();
    while (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      if (t.kind !== 'op' || (t.value !== '*' && t.value !== '/' && t.value !== '%')) break;
      this.pos++;
      const right = this.parsePow();
      if (t.value === '*') left = left * right;
      else if (t.value === '/') left = right === 0 ? 0 : left / right;
      else left = right === 0 ? 0 : left % right;
    }
    return left;
  }

  // ^ (right-associative)
  private parsePow(): number {
    const left = this.parseUnary();
    if (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      if (t.kind === 'op' && t.value === '^') {
        this.pos++;
        const right = this.parsePow();
        return Math.pow(left, right);
      }
    }
    return left;
  }

  // unary + -
  private parseUnary(): number {
    if (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      if (t.kind === 'op' && (t.value === '+' || t.value === '-')) {
        this.pos++;
        const v = this.parseUnary();
        return t.value === '-' ? -v : v;
      }
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.tokens[this.pos];
    if (!t) throw new Error('Unexpected end of expression');
    if (t.kind === 'num') {
      this.pos++;
      return t.value;
    }
    if (t.kind === 'lparen') {
      this.pos++;
      const v = this.parseAddSub();
      const closer = this.tokens[this.pos];
      if (!closer || closer.kind !== 'rparen') throw new Error('Missing )');
      this.pos++;
      return v;
    }
    if (t.kind === 'ident') {
      this.pos++;
      const next = this.tokens[this.pos];
      if (next && next.kind === 'lparen') {
        this.pos++;
        const args: number[] = [];
        if (this.tokens[this.pos]?.kind !== 'rparen') {
          args.push(this.parseAddSub());
          while (this.tokens[this.pos]?.kind === 'comma') {
            this.pos++;
            args.push(this.parseAddSub());
          }
        }
        const closer = this.tokens[this.pos];
        if (!closer || closer.kind !== 'rparen') throw new Error(`Missing ) for ${t.value}`);
        this.pos++;
        const fn = ALLOWED_FUNCTIONS[t.value];
        if (!fn) throw new Error(`Unknown function '${t.value}'`);
        return fn(...args);
      }
      // Identifier as variable.
      if (t.value === 'base') return this.ctx.base;
      if (t.value === 'streak') return this.ctx.streak;
      if (t.value === 'neglect') return this.ctx.neglect;
      if (t.value === 'age') return this.ctx.age;
      if (t.value === 'coins') return this.ctx.coins;
      throw new Error(`Unknown identifier '${t.value}'`);
    }
    throw new Error(`Unexpected token '${(t as { value?: unknown }).value ?? t.kind}'`);
  }
}

// Returns null if the formula is syntactically invalid OR if evaluation throws. Callers should
// fall back to the static computation when null is returned so a typo in advanced mode can't
// silently zero out rewards forever.
export function evaluateFormula(formula: string, ctx: FormulaContext): number | null {
  const trimmed = (formula ?? '').trim();
  if (!trimmed) return null;
  try {
    const tokens = tokenize(trimmed);
    const parser = new Parser(tokens, ctx);
    const result = parser.evaluate();
    if (!Number.isFinite(result)) return null;
    return Math.max(0, result);
  } catch {
    return null;
  }
}

// Returns a non-null human message when the formula is invalid, or null when it parses and
// evaluates cleanly against a probe context. Used to give immediate feedback in the settings UI.
export function validateFormula(formula: string): string | null {
  const trimmed = (formula ?? '').trim();
  if (!trimmed) return null;
  try {
    const tokens = tokenize(trimmed);
    const parser = new Parser(tokens, { base: 1, streak: 1, neglect: 1, age: 1, coins: 1 });
    const result = parser.evaluate();
    if (!Number.isFinite(result)) return 'Formula does not produce a finite number';
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}
